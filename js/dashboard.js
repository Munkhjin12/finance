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

// === ХУУДАС АЧААЛАГДАХАД АЖИЛЛАХ ХЭСЭГ ===
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = 'index.html';
        return;
    }
    document.getElementById('user-email').textContent = user.email;
    
    // Хуудас ачаалагдахад бүх өгөгдлийг зэрэг татаж харуулна
    await fetchBudgets();
    await fetchTransactions();
    await fetchUserBadges(); 
});

// === ШИНЭ ГҮЙЛГЭЭ НЭМЭХ ЛОГИК ===
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

    // --- ТӨСӨВ ХЭТЭРСЭН ЭСЭХИЙГ ШАЛГАНА ---
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
            const endDate = `${currentMonthYear}-31`;

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
                const parts = currentMonthYear.split('-');
                const displayMonth = `${parts[0]} оны ${parts[1]} сар`;

                const proceed = confirm(
                    `⚠️ АНХААРУУЛГА!\n\nТаны ${displayMonth}-ын "${category}" ангиллын төсвийн хязгаар: ${limitAmount.toLocaleString()} ₮\nОдоогийн нийт зарцуулалт: ${currentTotal.toLocaleString()} ₮ болох гэж байна.\n\nТөсөв хэтрүүлж гүйлгээг үргэлжлүүлэх үү?`
                );
                
                if (!proceed) return; 
            }
        }
    }

    // --- ГҮЙЛГЭЭ ХАДГАЛАХ ХЭСЭГ ---
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
        
        // Шинэ гүйлгээ нэмэгдсэний дараа бүх бажуудыг дахин бодож шинэчилнэ/устгана
        await checkActivityBadge(user.id);
        await checkBudgetMasterBadge(user.id);
    }
    await fetchTransactions();
    await fetchUserBadges(); // Цолны жагсаалтыг хамгийн сүүлд нь дэлгэцэнд зурна
});

// === ГҮЙЛГЭЭ ТАТАХ ФУНКЦ ===
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

// === ГҮЙЛГЭЭГ ДЭЛГЭЦЭНД ХАРУУЛАХ ===
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
        
        // Хэрэв гүйлгээ байхгүй бол балансын цолнуудыг устгана
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

// === ГҮЙЛГЭЭ УСТГАХ ФУНКЦ ===
window.deleteTransaction = async function(id) {
    const confirmDelete = confirm("Та энэ гүйлгээг устгахдаа итгэлтэй байна уу?");
    if (!confirmDelete) return;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Гүйлгээг устгах
        const { error } = await supabase
            .from('transactions')
            .delete()
            .eq('id', id);

        if (error) throw error;
        alert("Гүйлгээ амжилттай устгагдлаа.");

        // 2. Гүйлгээнүүдийг дахин уншиж дэлгэцэнд зурна (Балансын цолыг дотроо автоматаар устгаж/шинэчилнэ)
        await fetchTransactions();

        // 3. Гүйлгээ цөөрсөн тул идэвхийн болон төсвийн цолыг устгах эсэхийг дахин шалгана
        await checkActivityBadge(user.id);
        await checkBudgetMasterBadge(user.id);

        // 4. Эцэст нь авсан цолнуудын жагсаалтыг дахин уншиж дэлгэцэнд зурна
        await fetchUserBadges();

    } catch (error) {
        alert("Гүйлгээ устгах явцад алдаа гарлаа: " + error.message);
    }
}

// === СИСТЕМЭЭС ГАРАХ ===
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

// === ТӨСӨВ ТОГТООХ ФОРМЫН ЛОГИК ===
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
        await checkBudgetMasterBadge(user.id); // Төсөв шинээр нэмэгдэхэд мөн цол шалгана
        await fetchUserBadges();
    }
});

// === ТӨСӨВ ТАТАЖ ЖАГСААХ БОЛОН АШИГЛАЛТЫГ ХАРУУЛАХ ===
async function fetchBudgets() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Бүх тогтоосон төсвүүдийг татах
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
        if (summaryContainer) summaryContainer.classList.add('d-none'); // Төсөв байхгүй бол хураангуйг нууна
        budgetsContainer.innerHTML = `
            <h6 class="fw-bold text-dark mb-3">Одоогийн тогтоосон төсвүүд:</h6>
            <div class="text-center py-3 text-muted small bg-light rounded">Одоогоор төсөв тогтоогоогүй байна.</div>
        `;
        return;
    }

    // 2. Яг одоогийн сарын зарлагуудыг татаж, төсөвтэй тулгах бэлтгэл хийх
    const currentMonthYear = new Date().toISOString().substring(0, 7); // "2026-06" г.м
    const startDate = `${currentMonthYear}-01`;
    const endDate = `${currentMonthYear}-31`;

    const { data: expenses } = await supabase
        .from('transactions')
        .select('category, amount')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .gte('date', startDate)
        .lte('date', endDate);

    // Зарлагуудыг ангиллаар нь бүлэглэх
    let expenseMap = {};
    if (expenses) {
        expenses.forEach(tx => {
            expenseMap[tx.category] = (expenseMap[tx.category] || 0) + tx.amount;
        });
    }

    // Нийт тооцоог бодох хувьсагчид
    let totalBudgetAmount = 0;
    let totalBudgetSpent = 0;

    let htmlContent = `<h6 class="fw-bold text-dark mb-3">Ангилал тус бүрийн ашиглалт:</h6>`;
    
    budgets.forEach(b => {
        let displayMonth = b.month_year;
        if (b.month_year && b.month_year.includes('-')) {
            const parts = b.month_year.split('-');
            displayMonth = `${parts[0]} оны ${parts[1]} сар`;
        }

        // Энэ ангиллын төсөвт харгалзах зарлага (Зөвхөн ижил сарынх бол)
        const isCurrentMonth = b.month_year === currentMonthYear;
        const spent = isCurrentMonth ? (expenseMap[b.category] || 0) : 0;
        const remaining = b.limit_amount - spent;
        
        // Зөвхөн энэ сарын төсвийг нийт тооцоонд нэмнэ
        if (isCurrentMonth) {
            totalBudgetAmount += b.limit_amount;
            totalBudgetSpent += spent;
        }

        // Ангилал тус бүрийн ашиглалтын хувь
        const percent = Math.min(Math.round((spent / b.limit_amount) * 100), 100) || 0;
        const barColor = percent >= 100 ? 'bg-danger' : percent >= 80 ? 'bg-warning' : 'bg-success';

        htmlContent += `
            <div class="card p-3 mb-2 bg-light border-0 shadow-sm">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <div>
                        <span class="fw-bold small text-dark">${b.category}</span>
                        <span class="text-muted mx-1">•</span>
                        <span class="small text-secondary fw-medium">${displayMonth}</span>
                    </div>
                    <span class="fw-bold text-primary small">${spent.toLocaleString()} ₮ / ${b.limit_amount.toLocaleString()} ₮</span>
                </div>
                
                <div class="progress my-1" style="height: 6px; border-radius: 3px;">
                    <div class="progress-bar ${barColor}" role="progressbar" style="width: ${percent}%"></div>
                </div>
                
                <div class="d-flex justify-content-between entry-sub-text" style="font-size: 11px;">
                    <span class="text-muted">Ашиглалт: ${percent}%</span>
                    <span class="${remaining >= 0 ? 'text-success' : 'text-danger'} fw-medium">
                        ${remaining >= 0 ? 'Үлдсэн: ' + remaining.toLocaleString() : 'Хэтэрсэн: ' + Math.abs(remaining).toLocaleString()} ₮
                    </span>
                </div>
            </div>
        `;
    });

    budgetsContainer.innerHTML = htmlContent;

    // 3. НИЙТ ХУРААНГУЙ КАРТЫГ ШИНЭЧЛЭХ (Зөвхөн энэ сард төсөв тогтоосон бол харуулна)
    if (totalBudgetAmount > 0 && summaryContainer) {
        summaryContainer.classList.remove('d-none');
        
        const totalRemaining = totalBudgetAmount - totalBudgetSpent;
        const totalPercent = Math.min(Math.round((totalBudgetSpent / totalBudgetAmount) * 100), 100);
        
        document.getElementById('budget-summary-percent').innerText = `${totalPercent}%`;
        document.getElementById('budget-summary-spent').innerText = `${totalBudgetSpent.toLocaleString()} ₮`;
        
        const remainingEl = document.getElementById('budget-summary-remaining');
        if (totalRemaining >= 0) {
            remainingEl.innerText = `${totalRemaining.toLocaleString()} ₮`;
            remainingEl.className = 'text-success';
        } else {
            remainingEl.innerText = `Хэтэрсэн: ${Math.abs(totalRemaining).toLocaleString()} ₮`;
            remainingEl.className = 'text-danger';
        }

        const mainBar = document.getElementById('budget-summary-bar');
        mainBar.style.width = `${totalPercent}%`;
        mainBar.className = `progress-bar ${totalPercent >= 100 ? 'bg-danger' : totalPercent >= 80 ? 'bg-warning' : 'bg-primary'}`;
    } else if (summaryContainer) {
        summaryContainer.classList.add('d-none');
    }
}

// === БАЖ ШАЛГАХ ФУНКЦҮҮД ===
async function checkBudgetMasterBadge(userId) {
    const currentMonthYear = new Date().toISOString().substring(0, 7); 

    const { data: budgets } = await supabase
        .from('budgets')
        .select('category, limit_amount')
        .eq('user_id', userId)
        .eq('month_year', currentMonthYear);

    if (!budgets || budgets.length === 0) {
        await deleteBadge(userId, "Төсвийн Мастер");
        return; 
    }

    const startDate = `${currentMonthYear}-01`;
    const endDate = `${currentMonthYear}-31`;
    const { data: expenses } = await supabase
        .from('transactions')
        .select('category, amount')
        .eq('user_id', userId)
        .eq('type', 'expense')
        .gte('date', startDate)
        .lte('date', endDate);

    let expenseMap = {};
    if (expenses) {
        expenses.forEach(tx => {
            expenseMap[tx.category] = (expenseMap[tx.category] || 0) + tx.amount;
        });
    }

    let isAllUnderBudget = true;
    budgets.forEach(b => {
        const totalSpent = expenseMap[b.category] || 0;
        if (totalSpent > b.limit_amount) {
            isAllUnderBudget = false; 
        }
    });

    if (isAllUnderBudget) {
        await awardBadge(userId, "Төсвийн Мастер");
    } else {
        await deleteBadge(userId, "Төсвийн Мастер");
    }
}

// === ТУСЛАХ ФУНКЦ: ХЭРЭГЛЭГЧИЙН ЦОЛЫГ ӨГӨГДЛИЙН САНГААС УСТГАХ ===
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

// === БАЛАНСЫН ЦОЛЫГ ШАЛГАХ БОЛОН УСТГАХ ===
async function checkFinancialBalanceBadge(userId, totalIncome, totalExpense) {
    // 1. Санхүүгийн Халим шалгуур
    if (totalIncome > 0 && totalIncome >= totalExpense * 2) {
        await awardBadge(userId, "Санхүүгийн Халим");
    } else {
        await deleteBadge(userId, "Санхүүгийн Халим"); 
    }

    // 2. Ухаалаг Хэмнэгч шалгуур
    if (totalIncome > 0 && totalIncome > totalExpense) {
        await awardBadge(userId, "Ухаалаг Хэмнэгч");
    } else {
        await deleteBadge(userId, "Ухаалаг Хэмнэгч"); 
    }
}

// === ИДЭВХИЙН ЦОЛЫГ ШАЛГАХ БОЛОН УСТГАХ ===
async function checkActivityBadge(userId) {
    const { count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

    // Санхүүгийн Про (>= 100)
    if (count >= 100) { await awardBadge(userId, "Санхүүгийн Про"); } 
    else { await deleteBadge(userId, "Санхүүгийн Про"); }

    // Идэвхтэй Хэрэглэгч (>= 50)
    if (count >= 50) { await awardBadge(userId, "Идэвхтэй Хэрэглэгч"); } 
    else { await deleteBadge(userId, "Идэвхтэй Хэрэглэгч"); }

    // Санхүү хөтлөгч (>= 10) -> [ЗАСАЛТ] Олгодог нэртэйгээ ижилхэн болгож засав!
    if (count >= 10) { await awardBadge(userId, "Санхүү хөтлөгч"); } 
    else { await deleteBadge(userId, "Санхүү хөтлөгч"); }
}

// === БАЖ ОЛГОЖ СУПАБЕЙСЭД ХАДГАЛАХ ===
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

// === АВСАН БАЖУУДЫГ ТАТАЖ HTML ДЭЭР ХАРУУЛАХ ===
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