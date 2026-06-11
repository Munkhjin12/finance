import { supabase } from "./supabase.js";

// === ЭЛЕМЕНТҮҮДИЙГ БАРИЖ АВАХ ===
const transactionForm = document.getElementById('transaction-form');
const txTypeInput = document.getElementById('tx-type');
const txCategoryInput = document.getElementById('tx-category');
const txAmountInput = document.getElementById('tx-amount');
const txDateInput = document.getElementById('tx-date');
const txDescInput = document.getElementById('tx-desc');

const budgetForm = document.getElementById('budget-form');
const budgetCategoryInput = document.getElementById('budget-category');
const budgetAmountInput = document.getElementById('budget-amount');
const budgetMonthInput = document.getElementById('budget-month');

const btnLogout = document.getElementById('btn-logout');

// ТУСЛАХ ФУНКЦ: Локал цагаар "YYYY-MM" форматыг авах (UTC алдаанаас сэргийлнэ)
function getCurrentLocalMonthYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

// === HUUDAS ACHAALAGDAHAD AJILLAH KHESEG ===
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = 'index.html';
        return;
    }
    document.getElementById('user-email').textContent = user.email;
    
    await fetchBudgets();
    await fetchTransactions();
    await fetchUserBadges(); 
});

// === SHINE GUILGEE NEMEKH LOGIK ===
transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = txTypeInput.value;
    const category = txCategoryInput.value;
    const amount = parseFloat(txAmountInput.value);
    const date = txDateInput.value; 
    const description = txDescInput.value;
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        alert("Сешн дууссан байна. Дахин нэвтрэнэ үү!");
        window.location.href = 'index.html';
        return;
    }

    // --- TOSEV KHETERSEN ESEKHIYG SHALGANA ---
    if (type === 'expense') {
        const currentMonthYear = date.substring(0, 7); 

        const { data: budgetData } = await supabase
            .from('budgets')
            .select('limit_amount')
            .eq('user_id', user.id)
            .eq('category', category)
            .eq('month_year', currentMonthYear)
            .maybeSingle();

        if (budgetData) {
            const limitAmount = budgetData.limit_amount;
            const startDate = `${currentMonthYear}-01`;
            
            const parts = currentMonthYear.split('-');
            const lastDay = new Date(parts[0], parts[1], 0).getDate();
            const endDate = `${currentMonthYear}-${lastDay}`;

            const { data: pastExpenses } = await supabase
                .from('transactions')
                .select('amount')
                .eq('user_id', user.id)
                .eq('type', 'expense')
                .eq('category', category)
                .gte('date', startDate)
                .lte('date', endDate);
            
            let totalPastExpense = 0;
            if (pastExpenses) {
                pastExpenses.forEach(tx => {
                    totalPastExpense += tx.amount;
                });
            }

            if (totalPastExpense + amount > limitAmount) {
                const currentTotal = totalPastExpense + amount;
                const displayMonth = `${parts[0]} оны ${parts[1]} сар`;

                const proceed = confirm(
                    `⚠️ АНХААРУУЛГА!\n\nТаны ${displayMonth}-ын "${category}" ангиллын төсвийн хязгаар: ${limitAmount.toLocaleString()} ₮\nОдоогийн нийт зарцуулалт: ${currentTotal.toLocaleString()} ₮ болох гэж байна.\n\nТөсөв хэтрүүлж гүйлгээг үргэлжлүүлэх үү?`
                );
                
                if (!proceed) return; 
            }
        }
    }

    // --- GUILGEE KHADGALAKH KHESEG ---
    const { error } = await supabase
        .from('transactions')
        .insert([
            {
                user_id: user.id,
                type: type,
                category: category,
                amount: amount,
                description: description,
                date: date
            }
        ]);

    if (error) {
        alert("Гүйлгээг хадгалахад алдаа гарлаа: " + error.message);
    } else {
        alert("Гүйлгээ амжилттай бүртгэгдлээ!");
        transactionForm.reset();
        
        await checkActivityBadge(user.id);
        await checkBudgetMasterBadge(user.id);
    }
    await fetchTransactions();
    await fetchBudgets(); 
    await fetchUserBadges(); 
});

// === GUILGEE TATAKH FUNKTS ===
async function fetchTransactions() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

    if (error) {
        console.error("Гүйлгээ уншихад алдаа гарлаа:", error.message);
        return;
    }
    await renderTransactions(transactions);
}

// === GUILGEEGEE DELGETSEND KHARUULAKH ===
async function renderTransactions(transactions) {
    const listContainer = document.getElementById('transaction-list');
    const totalBalanceEl = document.getElementById('total-balance');
    const totalIncomeEl = document.getElementById('total-income');
    const totalExpenseEl = document.getElementById('total-expense');

    let totalIncome = 0;
    let totalExpense = 0;

    if (transactions.length === 0) {
        totalBalanceEl.innerText = '0₮';
        totalIncomeEl.innerText = '0₮';
        totalExpenseEl.innerText = '0₮';
        
        listContainer.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-4">
                    <i class="fa-solid fa-folder-open fs-3 d-block mb-2"></i>
                    Одоогоор ямар нэгэн гүйлгээ бүртгэгдээгүй байна.
                </td>
            </tr>
        `;
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await checkFinancialBalanceBadge(user.id, 0, 0);
            }
        } catch (err) {
            console.error(err);
        }
        return;
    }

    let htmlContent = '';
    
    transactions.forEach(tx => {
        const amount = parseFloat(tx.amount) || 0;

        if (tx.type === 'income') {
            totalIncome += amount;
        } else if (tx.type === 'expense') {
            totalExpense += amount;
        }

        const isIncome = tx.type === 'income';
        const badgeColor = isIncome ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger';
        const typeText = isIncome ? 'Орлого' : 'Зарлага';
        const amountSign = isIncome ? '+' : '-';
        const amountColor = isIncome ? 'text-success' : 'text-danger';

        htmlContent += `
            <tr>
                <td>${tx.date}</td>
                <td><span class="badge bg-light text-dark shadow-sm border">${tx.category}</span></td>
                <td class="text-secondary fw-medium">${tx.description}</td>
                <td><span class="badge ${badgeColor}">${typeText}</span></td>
                <td class="text-end fw-bold ${amountColor}">${amountSign}${amount.toLocaleString()} ₮</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-link text-danger p-0" onclick="deleteTransaction('${tx.id}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    const totalBalance = totalIncome - totalExpense;
    totalIncomeEl.innerText = `${totalIncome.toLocaleString()}₮`;
    totalExpenseEl.innerText = `${totalExpense.toLocaleString()}₮`;
    totalBalanceEl.innerText = `${totalBalance.toLocaleString()}₮`;

    listContainer.innerHTML = htmlContent;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await checkFinancialBalanceBadge(user.id, totalIncome, totalExpense);
        }
    } catch (err) {
        console.error("Баж шалгахад алдаа гарлаа:", err);
    }
}

// === GUILGEE USTGAKH FUNKTS ===
window.deleteTransaction = async function(id) {
    const confirmDelete = confirm("Та энэ гүйлгээг устгахдаа итгэлтэй байна уу?");
    if (!confirmDelete) return;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('transactions')
            .delete()
            .eq('id', id);

        if (error) throw error;
        alert("Гүйлгээ амжилттай устгагдлаа.");

        await fetchTransactions();
        await fetchBudgets(); 
        await checkActivityBadge(user.id);
        await checkBudgetMasterBadge(user.id);
        await fetchUserBadges();

    } catch (error) {
        alert("Гүйлгээ устгах явцад алдаа гарлаа: " + error.message);
    }
}

// === SYSTEMEES GARAKH ===
btnLogout.addEventListener('click', async () => {
    const confirmLogout = confirm("Та системээс гарахдаа итгэлтэй байна уу?");
    if (!confirmLogout) return;

    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        window.location.href = 'index.html';
    } catch (error) {
        alert("Системээс гарахад алдаа гарлаа: " + error.message);
    }
});

// === TOSEV TOGTOOKH FORMYN LOGIK ===
budgetForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const category = budgetCategoryInput.value;
    const limitAmount = parseFloat(budgetAmountInput.value);
    const monthYear = budgetMonthInput.value; 

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        alert("Сешн дууссан байна!");
        return;
    }

    const { error } = await supabase
        .from('budgets')
        .insert([
            {
                user_id: user.id,
                category: category,
                limit_amount: limitAmount,
                month_year: monthYear
            }
        ]);

    if (error) {
        alert("Төсөв тогтооход алдаа гарлаа: " + error.message);
    } else {
        const dateParts = monthYear.split('-');
        alert(`${dateParts[0]} оны ${dateParts[1]} сарын ${category} ангилалд төсөв амжилттай тогтоогдлоо!`);
        budgetForm.reset();
        
        const instance = bootstrap.Offcanvas.getInstance(document.getElementById('offcanvasBudget'));
        if (instance) instance.hide();
        
        await fetchBudgets();
        
        // Шинээр төсөв үүсгэх үед шууд мастер болгохгүй, хуучин цол байвал түр цэвэрлэнэ
        await deleteBadge(user.id, "Төсвийн Мастер"); 
        await fetchUserBadges();
    }
});

// === TOSEV TATAJH JAAGSAAKH BOLON ULDEGDEL, PROGRESS KHARUULAKH ===
async function fetchBudgets() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: budgets, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .order('month_year', { ascending: false });

    if (error) {
        console.error("Төсөв уншихад алдаа гарлаа:", error.message);
        return;
    }

    const budgetsContainer = document.getElementById('current-budgets-list');
    const summaryContainer = document.getElementById('budget-summary-container');
    
    if (!budgets || budgets.length === 0) {
        if (summaryContainer) summaryContainer.classList.add('d-none');
        budgetsContainer.innerHTML = `
            <h6 class="fw-bold text-dark mb-3">Одоогийн тогтоосон төсвүүд:</h6>
            <div class="text-center py-3 text-muted small bg-light rounded">Одоогоор төсөв тогтоогоогүй байна.</div>
        `;
        return;
    }

    const currentMonthYear = getCurrentLocalMonthYear(); 
    const startDate = `${currentMonthYear}-01`;
    
    const dateParts = currentMonthYear.split('-');
    const lastDay = new Date(dateParts[0], dateParts[1], 0).getDate();
    const endDate = `${currentMonthYear}-${lastDay}`;

    const { data: expenses } = await supabase
        .from('transactions')
        .select('category, amount, date')
        .eq('user_id', user.id)
        .eq('type', 'expense');

    let expenseMap = {};
    if (expenses) {
        expenses.forEach(tx => {
            if (tx.date) {
                const txMonth = tx.date.substring(0, 7); 
                const key = `${txMonth}_${tx.category}`;
                expenseMap[key] = (expenseMap[key] || 0) + tx.amount;
            }
        });
    }

    let totalBudgetAmount = 0;
    let totalBudgetSpent = 0;
    let hasCurrentMonthBudget = false;

    let htmlContent = `<h6 class="fw-bold text-dark mb-3">Ангилал тус бүрийн ашиглалт, үлдэгдэл:</h6>`;
    
    budgets.forEach(b => {
        let displayMonth = b.month_year;
        if (b.month_year && b.month_year.includes('-')) {
            const parts = b.month_year.split('-');
            displayMonth = `${parts[0]} оны ${parts[1]} сар`;
        }

        const budgetKey = `${b.month_year}_${b.category}`;
        const spent = expenseMap[budgetKey] || 0;
        const remaining = b.limit_amount - spent;
        
        if (b.month_year === currentMonthYear) {
            totalBudgetAmount += b.limit_amount;
            totalBudgetSpent += spent;
            hasCurrentMonthBudget = true;
        }

        const percent = Math.min(Math.round((spent / b.limit_amount) * 100), 100) || 0;
        const barColor = percent >= 100 ? 'bg-danger' : percent >= 80 ? 'bg-warning' : 'bg-success';

        htmlContent += `
            <div class="card p-3 mb-2 bg-light border-0 shadow-sm position-relative">
                <div class="d-flex justify-content-between align-items-center mb-1 pe-4">
                    <div>
                        <span class="fw-bold small text-dark">${b.category}</span>
                        <span class="text-muted mx-1">•</span>
                        <span class="small text-secondary fw-medium">${displayMonth}</span>
                    </div>
                    <span class="fw-bold text-primary small">${spent.toLocaleString()} ₮ / ${b.limit_amount.toLocaleString()} ₮</span>
                </div>
                
                <div class="progress my-2" style="height: 6px; border-radius: 3px;">
                    <div class="progress-bar ${barColor}" role="progressbar" style="width: ${percent}%"></div>
                </div>
                
                <div class="d-flex justify-content-between small" style="font-size: 11px;">
                    <span class="text-muted">Ашиглалт: ${percent}%</span>
                    <span class="${remaining >= 0 ? 'text-success' : 'text-danger'} fw-bold">
                        ${remaining >= 0 ? 'Ашиглах үлдэгдэл: ' + remaining.toLocaleString() : 'Хэтэрсэн: ' + Math.abs(remaining).toLocaleString()} ₮
                    </span>
                </div>

                <button class="btn btn-sm text-danger p-0 position-absolute" style="top: 10px; right: 12px;" onclick="deleteBudget('${b.id}')" title="Төсөв устгах">
                    <i class="fa-solid fa-trash-can small"></i>
                </button>
            </div>
        `;
    });

    budgetsContainer.innerHTML = htmlContent;

    if (hasCurrentMonthBudget && totalBudgetAmount > 0 && summaryContainer) {
        summaryContainer.classList.remove('d-none');
        
        const totalRemaining = totalBudgetAmount - totalBudgetSpent;
        const totalPercent = Math.min(Math.round((totalBudgetSpent / totalBudgetAmount) * 100), 100) || 0;
        
        document.getElementById('budget-summary-percent').innerText = `${totalPercent}%`;
        document.getElementById('budget-summary-spent').innerText = `${totalBudgetSpent.toLocaleString()} ₮`;
        
        const remainingEl = document.getElementById('budget-summary-remaining');
        if (totalRemaining >= 0) {
            remainingEl.innerText = `${totalRemaining.toLocaleString()} ₮`;
            remainingEl.className = 'text-success fw-bold';
        } else {
            remainingEl.innerText = `Хэтэрсэн: ${Math.abs(totalRemaining).toLocaleString()} ₮`;
            remainingEl.className = 'text-danger fw-bold';
        }

        const mainBar = document.getElementById('budget-summary-bar');
        mainBar.style.width = `${totalPercent}%`;
        mainBar.className = `progress-bar ${totalPercent >= 100 ? 'bg-danger' : totalPercent >= 80 ? 'bg-warning' : 'bg-primary'}`;
    } else if (summaryContainer) {
        summaryContainer.classList.add('d-none');
    }
}

// === TOSEV USTGAKH FUNKTS ===
window.deleteBudget = async function(budgetId) {
    const confirmDelete = confirm("Та энэ тогтоосон төсвийг устгахдаа итгэлтэй байна уу?");
    if (!confirmDelete) return;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('budgets')
            .delete()
            .eq('id', budgetId);

        if (error) throw error;
        alert("Төсөв амжилттай устгагдлаа.");

        await fetchBudgets();
        await checkBudgetMasterBadge(user.id);
        await fetchUserBadges();

    } catch (error) {
        alert("Төсөв устгахад алдаа гарлаа: " + error.message);
    }
}

// === BAJ SHALGAKH FUNKTSUUD ===
async function checkBudgetMasterBadge(userId) {
    const currentMonthYear = getCurrentLocalMonthYear(); 

    const { data: budgets } = await supabase
        .from('budgets')
        .select('category, limit_amount, month_year')
        .eq('user_id', userId)
        .eq('month_year', currentMonthYear);

    if (!budgets || budgets.length === 0) {
        await deleteBadge(userId, "Төсвийн Мастер");
        return; 
    }

    const { data: expenses } = await supabase
        .from('transactions')
        .select('category, amount, date')
        .eq('user_id', userId)
        .eq('type', 'expense');

    let expenseMap = {};
    if (expenses) {
        expenses.forEach(tx => {
            if (tx.date) {
                const txMonth = tx.date.substring(0, 7);
                const key = `${txMonth}_${tx.category}`;
                expenseMap[key] = (expenseMap[key] || 0) + tx.amount;
            }
        });
    }

    let isAllUnderBudget = true;
    let hasActiveUsage = false; // Төсөв тогтоосон ангилалд бодитоор зарлага хийсэн эсэхийг шалгана

    budgets.forEach(b => {
        const budgetKey = `${b.month_year}_${b.category}`;
        const totalSpent = expenseMap[budgetKey] || 0;

        if (totalSpent > 0) {
            hasActiveUsage = true;
        }

        if (totalSpent > b.limit_amount) {
            isAllUnderBudget = false; 
        }
    });

    // Зөвхөн хязгаар дотроо байгаа БӨГӨӨД ядаж нэг төсвийг ашиглаж (зарлага хийж) эхэлсэн үед цол өгнө
    if (isAllUnderBudget && hasActiveUsage) {
        await awardBadge(userId, "Төсвийн Мастер");
    } else {
        await deleteBadge(userId, "Төсвийн Мастер");
    }
}

// === TUSLAKH FUNKTS: KHEREGLYEGCHIIN TSOLYG OGOGDLIIN SANGAAS USTGAKH ===
async function deleteBadge(userId, badgeName) {
    const { error } = await supabase
        .from('badges')
        .delete()
        .eq('user_id', userId)
        .eq('badge_name', badgeName);

    if (error) {
        console.error(`"${badgeName}" цолыг устгахад алдаа гарлаа:`, error.message);
    }
}

// === BALANSIIN TSOLYG SHALGAKH BOLON USTGAKH ===
async function checkFinancialBalanceBadge(userId, totalIncome, totalExpense) {
    if (totalIncome > 0 && totalIncome >= totalExpense * 2) {
        await awardBadge(userId, "Санхүүгийн Халим");
    } else {
        await deleteBadge(userId, "Санхүүгийн Халим"); 
    }

    if (totalIncome > 0 && totalIncome > totalExpense) {
        await awardBadge(userId, "Ухаалаг Хэмнэгч");
    } else {
        await deleteBadge(userId, "Ухаалаг Хэмнэгч"); 
    }
}

// === IDEVKHIIN TSOLYG SHALGAKH BOLON USTGAKH ===
async function checkActivityBadge(userId) {
    const { count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

    if (count >= 100) { await awardBadge(userId, "Санхүүгийн Про"); } 
    else { await deleteBadge(userId, "Санхүүгийн Про"); }

    if (count >= 50) { await awardBadge(userId, "Идэвхтэй Хэрэглэгч"); } 
    else { await deleteBadge(userId, "Идэвхтэй Хэрэглэгч"); }

    if (count >= 10) { await awardBadge(userId, "Санхүү хөтлөгч"); } 
    else { await deleteBadge(userId, "Санхүү хөтлөгч"); }
}

// === BAJ OLGOJ SUPABASE-D KHADGALAKH ===
async function awardBadge(userId, badgeName) {
    const { data: existing, error: checkError } = await supabase
        .from('badges')
        .select('id')
        .eq('user_id', userId)
        .eq('badge_name', badgeName)
        .maybeSingle();

    if (checkError) {
        console.error("Баж шалгахад алдаа гарлаа:", checkError.message);
        return;
    }

    if (!existing) {
        const { error: insertError } = await supabase
            .from('badges')
            .insert([
                { 
                    user_id: userId, 
                    badge_name: badgeName 
                }
            ]);

        if (insertError) {
            console.error("Баж хадгалахад алдаа гарлаа:", insertError.message);
            return;
        }

        alert(`🎉 Баяр хүргэе! Та "${badgeName}" баж авлаа!`);
    }
}

// === AVSAN BAJUUDYG TATAJH HTML DEER KHARUULAKH ===
async function fetchUserBadges() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: badges, error } = await supabase
        .from('badges')
        .select('*')
        .eq('user_id', user.id)
        .order('awarded_at', { ascending: false });

    if (error) {
        console.error("Баж уншихад алдаа гарлаа:", error.message);
        return;
    }

    const badgesContainer = document.getElementById('user-badges-list');
    if (!badgesContainer) return; 

    if (!badges || badges.length === 0) {
        badgesContainer.innerHTML = `<div class="text-center py-2 text-muted small bg-light rounded w-100">Одоогоор шагнал аваагүй байна.</div>`;
        return;
    }

    let htmlContent = '';
    badges.forEach(b => {
        let icon = '🏅';
        let bgStyle = 'background: #f8f9fa; color: #212529;'; 
        
        if (b.badge_name === 'Санхүүгийн Халим') { icon = '🐋'; bgStyle = 'background: #e7f5ff; color: #1c7ed6; border: 1px solid #a5d8ff;'; }
        if (b.badge_name === 'Ухаалаг Хэмнэгч') { icon = '🦊'; bgStyle = 'background: #ebfbee; color: #2b8a3e; border: 1px solid #b2f2bb;'; }
        if (b.badge_name === 'Төсвийн Мастер') { icon = '👑'; bgStyle = 'background: #fff9db; color: #e67700; border: 1px solid #ffe066;'; }
        if (b.badge_name === 'Санхүү хөтлөгч') { icon = '🎒'; bgStyle = 'background: #f3f0ff; color: #6741d9; border: 1px solid #d0bfff;'; }
        if (b.badge_name === 'Идэвхтэй Хэрэглэгч') { icon = '🔥'; bgStyle = 'background: #fff5f5; color: #e03131; border: 1px solid #ffc9c9;'; }
        if (b.badge_name === 'Санхүүгийн Про') { icon = '💎'; bgStyle = 'background: #e3fafc; color: #0b7285; border: 1px solid #99e9f2;'; }

        htmlContent += `
            <div class="card d-inline-block text-center m-1 p-2 shadow-sm text-truncate" style="width: 105px; ${bgStyle} font-size: 10px; border-radius: 8px;">
                <div class="fs-3 mb-1">${icon}</div>
                <div class="fw-bold">${b.badge_name}</div>
            </div>
        `;
    });

    badgesContainer.innerHTML = htmlContent;
}