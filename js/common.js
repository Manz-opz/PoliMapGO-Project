//admin only element checks
document.addEventListener("DOMContentLoaded", () => {
  const role = localStorage.getItem("role");
  if (role === "admin") {
    document.querySelectorAll(".admin-only").forEach(el => {
      el.style.display = "block";
    });
  }
});

//supabase key and url
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://spmnhcxigezzjqabxpmg.supabase.co";
const supabaseKey ="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbW5oY3hpZ2V6empxYWJ4cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3OTE2ODcsImV4cCI6MjA3MjM2NzY4N30.cghMxz__fkITUUzFSYaXxLi4kUj8jKDfNUGpQH35kr4";

window.supabase = createClient(supabaseUrl, supabaseKey);

//sidebar and back button
function goBack() {
    window.location.href = "map.html"; // Tukar ke file yang kau nak
}
function SidebarBtn() {
    const sidebar = document.getElementById("sidebarId"); //id sidebar
    sidebar.classList.toggle("active"); //tgk sidebar kalau xde kelas active dia letak dan sebaliknya
}
function closebtn() {
    const close = document.getElementById("sidebarId");
    close.classList.remove("active"); //buang class active
}
document.addEventListener("click", function (event) {
const sidebar = document.getElementById("sidebarId"); //cari element ikut id
const togglebtn = document.querySelector(".bi-list"); //cari element ikut class

if (
    sidebar.classList.contains("active") && //check sidebar ada active atau x (kalau x dia xbuat apa ii)
    !sidebar.contains(event.target) && //check tempat user click luar sidebar
    !togglebtn.contains(event.target) // check tempat click bukan togglebtn(button menu)
    ) {
        sidebar.classList.remove("active"); //selepas semua tu ada baru dia remove active (sidebar hilang)
    }
});
