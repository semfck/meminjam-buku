document.getElementById("pinjamForm").addEventListener("submit", function(e) {
    e.preventDefault();
    if (!validateForm()) return;
    // Proses data
  });
  
  function validateForm() {
    const nama = document.getElementById("nama").value;
    if (!nama) {
      alert("Nama harus diisi!");
      return false;
    }
    return true;
  }