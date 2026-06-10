import { supabase } from "./supabase.js";

// HTML элементүүдийг сонгож авах
const authForm = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const btnRegister = document.getElementById("btn-register");
const messageDiv = document.getElementById("message");

// Оролтын утгуудыг шалгах тусдаа функц
function validateInputs(email, password) {
    if (!email || !password) {
        showMessage("Имэйл болон нууц үгийг бүрэн оруулна уу!", "text-danger");
        return false;
    }
    if (password.length < 6) {
        showMessage("Нууц үгийн урт хамгийн багадаа 6 тэмдэгт байх ёстой!", "text-danger");
        return false;
    }
    return true;
}


btnRegister.addEventListener('click', async () => {
    console.log("Бүртгүүлэх товч дарагдлаа");
    
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!validateInputs(email, password)) return;

    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password, 
        });

        if (error) {
            showMessage(`Бүртгэл амжилтгүй: ${error.message}`, "text-danger");
        } else {
            showMessage("Бүртгэл амжилттай! Имэйлээ баталгаажуулна уу.", "text-success");
            passwordInput.value = ""; // Нууц үгийн талбарыг цэвэрлэх
            emailInput.value = "";    // Имэйл талбарыг цэвэрлэх
        }
    } catch (err) {
        showMessage("Сүлжээний алдаа гарлаа.", "text-danger");
    }
});


authForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    console.log("Нэвтрэх үйлдэл эхэллээ");

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!validateInputs(email, password)) return;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            showMessage(`Нэвтрэхэд алдаа гарлаа: ${error.message}`, "text-danger");
        } else {
            showMessage("Амжилттай нэвтэрлээ!", "text-success");
            setTimeout(()=>{
                window.location.href = 'dashboard.html'
            },1300)
        }
    } catch (err) {
        showMessage("Сүлжээний алдаа гарлаа.", "text-danger");
    }
});

function showMessage(text, bootstrapColorClass) {
    messageDiv.innerText = text;
    messageDiv.className = `text-center small mt-3 fw-medium ${bootstrapColorClass}`;
}