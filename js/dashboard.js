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
    await fetchTransactions();
    await fetchBudgets();
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
        
        // Шинэ гүйлгээ нэмэгдсэний дараа бажуудыг шалгана
        await checkActivityBadge(user.id);
        await checkBudgetMasterBadge(user.id);
    }
    await fetchTransactions();
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

    // [ЗАСАЛТ] .then()-ийг устгаж найдвартай async/await бүтэцтэй болгов
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

        // 2. Гүйлгээнүүдийг дахин уншиж дэлгэцэнд зурна (Энэ нь дотроо балансын цолыг шинэчилнэ)
        await fetchTransactions();

        // 3. Гүйлгээний тоо цөөрсөн тул идэвхийн цолыг дахин шалгаж устгана
        await checkActivityBadge(user.id);
        
        // 4. Төсвийн мастер цолыг дахин шалгах
        await checkBudgetMasterBadge(user.id);

        // 5. Эцэст нь авсан цолнуудын жагсаалтыг дахин уншиж дэлгэцэнд зурна
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
    }
});

// === ТӨСӨВ ТАТАЖ ЖАГСААХ ===
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
    
    if (!budgets || budgets.length === 0) {
        budgetsContainer.innerHTML = `
            <h6 class="fw-bold text-dark mb-3">Одоогийн тогтоосон төсвүүд:</h6>
            <div class="text-center py-3 text-muted small bg-light rounded">Одоогоор төсөв тогтоогоогүй байна.</div>
        `;
        return;
    }

    let htmlContent = `<h6 class="fw-bold text-dark mb-3">Одоогийн тогтоосон төсвүүд:</h6>`;
    
    budgets.forEach(b => {
        let displayMonth = b.month_year;
        if (b.month_year && b.month_year.includes('-')) {
            const parts = b.month_year.split('-');
            displayMonth = `${parts[0]} оны ${parts[1]} сар`;
        }

        htmlContent += `
            <div class="card p-2 mb-2 bg-light border-0 shadow-sm">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <span class="fw-bold small text-dark">${b.category}</span>
                        <span class="text-muted mx-1">•</span>
                        <span class="small text-secondary fw-medium">${displayMonth}</span>
                    </div>
                    <span class="fw-bold text-primary small">${b.limit_amount.toLocaleString()} ₮</span>
                </div>
            </div>
        `;
    });

    budgetsContainer.innerHTML = htmlContent;
}

// === БАЖ ШАЛГАХ ФУНКЦҮҮД ===
async function checkBudgetMasterBadge(userId) {
    const currentMonthYear = new Date().toISOString().substring(0, 7); 

    const { data: budgets } = await supabase
        .from('budgets')
        .select('category, limit_amount')
        .eq('user_id', userId)
        .eq('month_year', currentMonthYear);

    if (!budgets || budgets.length === 0) return; 

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
    }
}

async function checkFinancialBalanceBadge(userId, totalIncome, totalExpense) {
    if (totalIncome > 0 && totalIncome >= totalExpense * 2) {
        await awardBadge(userId, "Санхүүгийн Халим");
    } else if (totalIncome > 0 && totalIncome > totalExpense) {
        await awardBadge(userId, "Ухаалаг Хэмнэгч");
    }
}

async function checkActivityBadge(userId) {
    const { count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

    if (count >= 100) {
        await awardBadge(userId, "Санхүүгийн Про");
    } else if (count >= 50) {
        await awardBadge(userId, "Идэвхтэй Хэрэглэгч");
    } else if (count >= 10) {
        await awardBadge(userId, "Санхүү хөтлөгч");
    }
}

// === БАЖ ОЛГОЖ СУПАБЕЙСЭД ХАДГАЛАХ ===
async function awardBadge(userId, badgeName) {
    // 1. Эхлээд энэ баж урьд нь хадгалагдсан эсэхийг шалгана
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

    // 2. Хэрэв урьд нь аваагүй баж бол шинээр ИНСЕРТ хийнэ
    if (!existing) {
        // [ЧУХАЛ ЗАСАЛТ]: Энд заавал "await" байх ёстой. Тэгэхгүй бол өгөгдлийн санд бичиж амжилгүй алга болно!
        const { error: insertError } = await supabase
            .from('badges')
            .insert([
                { 
                    user_id: userId, 
                    badge_name: badgeName 
                    // awarded_at нь default-оор now() учраас заавал явуулах шаардлагагүй
                }
            ]);

        if (insertError) {
            console.error("Баж хадгалахад алдаа гарлаа:", insertError.message);
            return;
        }

        // Амжилттай хадгалагдсаны дараа л alert харуулна
        alert(`🎉 Баяр хүргэе! Та "${badgeName}" баж авлаа!`);
    }
    
    // Жагсаалтыг шинэчилж дэлгэцэнд зурна
    await fetchUserBadges(); 
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
        if (b.badge_name === 'Санхүүдээ Аялагч') { icon = '🎒'; bgStyle = 'background: #f3f0ff; color: #6741d9; border: 1px solid #d0bfff;'; }
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
        await deleteBadge(userId, "Санхүүгийн Халим"); // Нөхцөл хангахгүй бол устгана
    }

    // 2. Ухаалаг Хэмнэгч шалгуур
    if (totalIncome > 0 && totalIncome > totalExpense) {
        await awardBadge(userId, "Ухаалаг Хэмнэгч");
    } else {
        await deleteBadge(userId, "Ухаалаг Хэмнэгч"); // Нөхцөл хангахгүй бол устгана
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

    // Санхүүдээ Аялагч (>= 10)
    if (count >= 10) { await awardBadge(userId, "Санхүүдээ Аялагч"); } 
    else { await deleteBadge(userId, "Санхүүдээ Аялагч"); }
}