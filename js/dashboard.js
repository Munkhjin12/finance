import { supabase } from "./supabase.js";

const transactionForm = document.getElementById('transaction-form');
const txTypeInput = document.getElementById('tx-type');
const txCategoryInput = document.getElementById('tx-category');
const txAmountInput = document.getElementById('tx-amount');
const txDateInput = document.getElementById('tx-date');
const txDescInput = document.getElementById('tx-desc');

transactionForm.addEventListener('submit', async (e) =>{
    e.preventDefault();
    const type = txTypeInput.value;
    const category = txCategoryInput.value;
    const amount = parseFloat(txAmountInput.value);
    const date = txDateInput.value;
    const description = txDescInput.value;
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    // console.log(user)

    if (userError || !user) {
        alert("Сешн дууссан байна. Дахин нэвтрэнэ үү!");
        window.location.href = 'index.html';
        return;
    }
        // Supabase рүү шинэ мөр өгөгдөл нэмэх (Insert) үйлдэл
    const { data, error } = await supabase
        .from('transactions') // Хэрэглэх хүснэгтийн нэр
        .insert([
            {
                user_id: user.id,         // UUID
                type: type,               // 'орлого' эсвэл 'зарлага'
                category: category,       // 'Хоол хүнс', 'Цалин орлого' гэх мэт текст
                amount: amount,           // Мөнгөн дүн (Too)
                description: description, // Дэлгэрэнгүй тайлбар
                date: date                // Сонгосон огноо (YYYY-MM-DD)
            }
        ])
        .select(); // Хадгалагдсан өгөгдлийг хариу болгож буцааж авах

    if (error) {
        alert("Гүйлгээг хадгалахад алдаа гарлаа: " + error.message);
        console.error("Алдааны дэлгэрэнгүй:", error);
    } else {
        alert("Гүйлгээ амжилттай бүртгэгдлээ!");
        transactionForm.reset(); // Формын бүх талбарыг цэвэрлэж хоосон болгоно
    }
    fetchTransactions();
    
});

async function fetchTransactions() {
    // Нэвтэрсэн хэрэглэгчийг авах
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Supabase-с зөвхөн энэ хэрэглэгчийн гүйлгээнүүдийг огноогоор нь жагсааж авах
    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*') // Бүх баганыг уншиж авна
        .eq('user_id', user.id) // Зөвхөн энэ хэрэглэгчийнх гэсэн шүүлтүүр
        .order('date', { ascending: false }); // Хамгийн шинэ гүйлгээг дээр нь гаргана

    if (error) {
        console.error("Гүйлгээ уншихад алдаа гарлаа:", error.message);
        return;
    }
    // HTML хүснэгтэд гүйлгээнүүдийг үзүүлэх функцийг дуудаж, өгөгдлийг дамжуулна
    renderTransactions(transactions);
    
}function renderTransactions(transactions) {
    const listContainer = document.getElementById('transaction-list');
    
    // Дээд талын картуудын HTML элементүүдийг барьж авах
    const totalBalanceEl = document.getElementById('total-balance');
    const totalIncomeEl = document.getElementById('total-income');
    const totalExpenseEl = document.getElementById('total-expense');

    // Нийлбэр дүнгүүдийг хадгалах хувьсагчид
    let totalIncome = 0;
    let totalExpense = 0;

    // Хэрэв ямар ч гүйлгээ байхгүй бол картуудыг 0₮ болгоод хүснэгтэд хоосон гэж харуулна
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
    
    // Бүх гүйлгээнүүд дээгүүр давталт хийх
    transactions.forEach(tx => {
        const amount = parseFloat(tx.amount) || 0; // Датаг тоо хэлбэрт шилжүүлэх

        // Төрлөөс нь хамаарч орлого, зарлагын нийлбэрийг бодох логик
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

    // Үлдэгдлийг бодох (Орлогоос зарлагыг хасна)
    const totalBalance = totalIncome - totalExpense;

    // Олсон дүнгүүдээ дэлгэц дээрх картуудад зоож харуулах (.toLocaleString() нь мянгатаар таслал авна)
    totalIncomeEl.innerText = `${totalIncome.toLocaleString()}₮`;
    totalExpenseEl.innerText = `${totalExpense.toLocaleString()}₮`;
    totalBalanceEl.innerText = `${totalBalance.toLocaleString()}₮`;

    // Хүснэгтийн мөрүүдийг оруулах
    listContainer.innerHTML = htmlContent;
    
}
document.addEventListener('DOMContentLoaded', fetchTransactions);