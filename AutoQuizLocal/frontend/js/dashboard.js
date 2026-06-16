document.addEventListener("DOMContentLoaded", () => {
  const usernameSpan = document.getElementById("username");
  const logoutBtn = document.getElementById("logout-btn");
  const subjectSelect = document.getElementById("subject-select");
  const semesterSelect = document.getElementById("semester-select");
  const quizList = document.getElementById("quiz-list");
  const quizMessage = document.getElementById("quiz-message");
  const selectAllCheckbox = document.getElementById("select-all-quizzes");
  const startBtn = document.getElementById("start-btn");
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const answerModeRadios = document.querySelectorAll('input[name="answer-mode"]');
  const uploadContainer = document.getElementById('upload-container');
  const imageUpload = document.getElementById('image-upload');
  const imagePreview = document.getElementById('image-preview');

  let subjectsData = []; // {name, link}
  let quartersData = []; // {name, link}
  let quizzesData = [];  // {name, link}

  // Load username from session
  const storedUsername = sessionStorage.getItem("username");
  if(storedUsername) usernameSpan.textContent = storedUsername;

  logoutBtn.addEventListener("click", () => {
    sessionStorage.clear();
    window.location.href = "index.html";
  });

  // Handle answer mode selection
  answerModeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      const isUpload = radio.value === 'upload';
      uploadContainer.style.display = isUpload ? 'block' : 'none';
      selectAllCheckbox.disabled = isUpload;
      if(isUpload){
        quizList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      }
    });
  });

  // Image upload preview
  imageUpload.addEventListener('change', e => {
    const file = e.target.files[0];
    if(file){
      const reader = new FileReader();
      reader.onload = function(event){
        imagePreview.innerHTML = `<img src="${event.target.result}" alt="Preview">`;
      };
      reader.readAsDataURL(file);
    } else {
      imagePreview.textContent = "No image selected";
    }
  });

  // ---------------------------
  // Fetch subjects from server
  async function loadSubjects() {
    try {
      const res = await fetch('http://localhost:3000/fetch-dashboard/subjects');
      const data = await res.json();
      if(!data.success) throw new Error(data.message);

      usernameSpan.textContent = data.user;
      sessionStorage.setItem('username', data.user);
      subjectsData = data.subjects || [];

      subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
      subjectsData.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.link;
        opt.textContent = s.name;
        subjectSelect.appendChild(opt);
      });

      semesterSelect.disabled = true;

    } catch (err) {
      console.error(err);
      quizMessage.textContent = "Failed to load subjects: " + err.message;
    }
  }

  loadSubjects();

  // Enable semester selection after subject chosen
  subjectSelect.addEventListener('change', async () => {
    semesterSelect.disabled = !subjectSelect.value;
    quizList.innerHTML = '';
    quizMessage.textContent = '';
    startBtn.disabled = true;
    selectAllCheckbox.checked = false;

    if(!subjectSelect.value) return;

    try {
      const res = await fetch('http://localhost:3000/fetch-dashboard/quarters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectLink: subjectSelect.value })
      });
      const data = await res.json();
      if(!data.success) throw new Error(data.message);

      quartersData = data.quarters || [];

      semesterSelect.innerHTML = '<option value="">-- Select Semester --</option>';
      quartersData.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.name;
        opt.dataset.link = q.link;
        opt.textContent = q.name;
        semesterSelect.appendChild(opt);
      });

    } catch(err) {
      console.error(err);
      quizMessage.textContent = "Failed to load quarters: " + err.message;
    }
  });

  // When semester selected -> fetch quizzes
  semesterSelect.addEventListener('change', async () => {
    quizList.innerHTML = '';
    quizMessage.textContent = '';
    startBtn.disabled = true;
    selectAllCheckbox.checked = false;

    if(!semesterSelect.value) return;

    const quarterName = semesterSelect.value;
    try {
      const res = await fetch('http://localhost:3000/fetch-dashboard/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarterName })
      });
      const data = await res.json();
      if(!data.success) throw new Error(data.message);

      quizzesData = data.quizzes || [];

      if(quizzesData.length === 0){
        quizMessage.textContent = "All quizzes are done or semester has not started yet!";
        return;
      }

      // Populate quizzes as checkboxes
      quizzesData.forEach((quiz, index) => {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = `quiz-${index}`;
        cb.value = quiz.link;

        const label = document.createElement('label');
        label.htmlFor = `quiz-${index}`;
        label.textContent = quiz.name;

        const div = document.createElement('div');
        div.appendChild(cb);
        div.appendChild(label);

        quizList.appendChild(div);
      });

    } catch(err){
      console.error(err);
      quizMessage.textContent = "Failed to load quizzes: " + err.message;
    }
  });

  // Handle quiz selection enabling Start button (single listener)
  quizList.addEventListener('change', () => {
    const checked = quizList.querySelectorAll('input[type="checkbox"]:checked').length;
    startBtn.disabled = checked === 0;

    const isUpload = document.querySelector('input[name="answer-mode"]:checked').value === 'upload';
    if(isUpload && checked > 1){
      const lastChecked = Array.from(quizList.querySelectorAll('input[type="checkbox"]:checked')).pop();
      lastChecked.checked = false;
    }
  });

  // Start automation
  startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    updateProgress(10, 'Starting automation...');

    // Replace these setTimeouts with real Puppeteer automation calls later
    setTimeout(() => { updateProgress(30, 'Logging in to account...'); }, 1000);
    setTimeout(() => { updateProgress(50, 'Fetching available quizzes...'); }, 2000);
    setTimeout(() => { updateProgress(80, 'Completing selected tasks...'); }, 4000);
    setTimeout(() => { updateProgress(100, '✅ All tasks completed successfully!'); startBtn.disabled = false; }, 6000);
  });

  function updateProgress(percent, text) {
    progressFill.style.width = percent + '%';
    progressText.textContent = text;
  }

  // Select All (only for AI mode)
  selectAllCheckbox.addEventListener('change', () => {
    const isAI = document.querySelector('input[name="answer-mode"]:checked').value === 'ai';
    if(!isAI) return;
    const allCBs = quizList.querySelectorAll('input[type="checkbox"]');
    allCBs.forEach(cb => cb.checked = selectAllCheckbox.checked);
    startBtn.disabled = allCBs.length === 0 || !selectAllCheckbox.checked;
  });

});
