function showTab(tabId) {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  document.querySelector(`.tab[onclick="showTab('${tabId}')"]`).classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

function showSuccess(message) {
  const el = document.getElementById('success-message');
  el.textContent = message;
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 3000);
}

async function saveSettings(e) {
  e.preventDefault();
  const form = e.target;
  const data = {
    publicReply: form.elements['public-reply'].value,
    privateReply: form.elements['private-reply'].value
  };
  
  try {
    const response = await fetch('/update-settings?access_token=' + accessToken, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      showSuccess('Paramètres enregistrés avec succès!');
    } else {
      alert('Erreur lors de la sauvegarde');
    }
  } catch (error) {
    alert('Erreur réseau');
  }
}

async function addKeyword(e) {
  e.preventDefault();
  const form = e.target;
  const data = {
    keyword: form.elements['keyword-text'].value,
    publicReply: form.elements['keyword-public-reply'].value,
    privateReply: form.elements['keyword-private-reply'].value
  };
  
  try {
    const response = await fetch('/add-keyword?access_token=' + accessToken, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      // Add to UI
      const keywordList = document.getElementById('keyword-list');
      const keywordItem = document.createElement('div');
      keywordItem.className = 'keyword-item';
      keywordItem.id = 'keyword-' + encodeURIComponent(data.keyword);
      keywordItem.innerHTML = `
        <div class="keyword-header">
          <span class="keyword-text">${data.keyword}</span>
          <button class="delete-btn" onclick="deleteKeyword('${encodeURIComponent(data.keyword)}')">Supprimer</button>
        </div>
        <p><strong>Réponse Publique:</strong> ${data.publicReply}</p>
        <p><strong>Réponse Privée:</strong> ${data.privateReply}</p>
      `;
      keywordList.prepend(keywordItem);
      
      // Reset form
      form.reset();
      showSuccess('Mot-clé ajouté avec succès!');
    } else {
      alert('Erreur lors de l\'ajout');
    }
  } catch (error) {
    alert('Erreur réseau');
  }
}

async function deleteKeyword(keyword) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer ce mot-clé ?')) return;
  
  try {
    const response = await fetch('/delete-keyword?access_token=' + accessToken + '&keyword=' + keyword, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      document.getElementById('keyword-' + keyword).remove();
      showSuccess('Mot-clé supprimé avec succès!');
    } else {
      alert('Erreur lors de la suppression');
    }
  } catch (error) {
    alert('Erreur réseau');
  }
}

function encode(str) {
  return encodeURIComponent(str);
}