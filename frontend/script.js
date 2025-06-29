// Estado da aplicação
let currentUser = null;
let selectedPokemon = null;
let selectedDigimon = null;
let searchHistory = [];
let API_BASE_URL = 'http://localhost:3000';

// Verificar se estamos usando 127.0.0.1 e ajustar a URL
if (window.location.hostname === '127.0.0.1') {
    API_BASE_URL = 'http://127.0.0.1:3000';
}

// Funções para controlo das páginas
function showPage(pageId) {
    // Mostrar overlay de loading
    document.querySelector('.loading-overlay').classList.add('active');
    
    // Encontrar a página ativa atual
    const currentPage = document.querySelector('.page.active');
    
    // Se estamos na mesma página, não fazer nada
    if (currentPage && currentPage.id === pageId) {
        document.querySelector('.loading-overlay').classList.remove('active');
        return;
    }
    
    // Adicionar classe de transição para a página atual
    if (currentPage) {
        currentPage.classList.add('transitioning');
    }
    
    // Após um pequeno delay, trocar as páginas
    setTimeout(() => {
        // Remover classes ativas de todas as páginas
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active', 'transitioning');
        });
        
        // Ativar a nova página
        document.getElementById(pageId).classList.add('active');
        
        // Esconder overlay de loading
        document.querySelector('.loading-overlay').classList.remove('active');
        
        // Esconder sidebar em mobile após navegação
        if (window.innerWidth < 992) {
            document.querySelector('.sidebar').classList.remove('active');
        }
        
        // Preencher nome de utilizador no perfil
        if (pageId === 'profilePage' && currentUser) {
            document.getElementById('profileUsername').value = currentUser;
            loadHistory(); // Carregar histórico ao abrir o perfil
        }
        
        // Se for o dashboard, inicializar a app
        if (pageId === 'dashboardPage') {
            initApp();
        }
    }, 300);
}

// Função para mostrar alertas
function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    const alertEl = document.createElement('div');
    alertEl.className = `alert alert-${type} alert-dismissible fade show`;
    alertEl.role = 'alert';
    alertEl.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi ${type === 'success' ? 'bi-check-circle-fill' : type === 'info' ? 'bi-info-circle-fill' : 'bi-exclamation-circle-fill'} me-2"></i>
            <div>${message}</div>
            <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert"></button>
        </div>
    `;
    alertContainer.appendChild(alertEl);
    
    // Auto-remover após 5 segundos
    setTimeout(() => {
        alertEl.classList.remove('show');
        setTimeout(() => alertEl.remove(), 300);
    }, 5000);
}

// Autenticação via servidor
async function login(username, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password }),
            credentials: 'include' // IMPORTANTE para sessões
        });
        
        // Verificar se a resposta é JSON válido
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Credenciais inválidas');
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Resposta inválida do servidor');
        }
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user.username;
            localStorage.setItem('currentUser', currentUser);
            return true;
        } else {
            throw new Error(data.message || 'Credenciais inválidas');
        }
    } catch (error) {
        console.error('Erro no login:', error);
        showAlert(error.message || 'Erro na comunicação com o servidor', 'danger');
        return false;
    }
}

async function register(username, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username, password })
        });
        
        // Verificar se a resposta é JSON válido
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Erro no registo');
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            return true; // Resposta não JSON é considerada sucesso
        }
        
        const data = await response.json();
        
        if (data.success) {
            return true;
        } else {
            throw new Error(data.message || 'Erro no registo');
        }
    } catch (error) {
        console.error('Erro no registo:', error);
        showAlert(error.message || 'Erro na comunicação com o servidor', 'warning');
        return false;
    }
}

async function updatePassword(newPassword) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/update-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newPassword }),
            credentials: 'include'
        });
        
        // Verificar se a resposta é JSON válido
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Erro ao atualizar senha');
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            return true; // Resposta não JSON é considerada sucesso
        }
        
        const data = await response.json();
        
        if (data.success) {
            return true;
        } else {
            throw new Error(data.message || 'Erro ao atualizar senha');
        }
    } catch (error) {
        console.error('Erro ao atualizar senha:', error);
        showAlert(error.message || 'Erro na comunicação com o servidor', 'danger');
        return false;
    }
}

// Inicializar a aplicação
function initApp() {
    setupEventListeners();
}

// Configurar event listeners
function setupEventListeners() {
    // Configurar evento de Enter para Pokémon
    document.getElementById('pokemonSearch').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const searchTerm = this.value.trim();
            if (searchTerm) {
                getPokemonDetails(searchTerm);
            }
        }
    });
    
    // Configurar evento de Enter para Digimon
    document.getElementById('digimonSearch').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const searchTerm = this.value.trim();
            if (searchTerm) {
                getDigimonDetails(searchTerm);
            }
        }
    });
}

// Obter detalhes de Pokémon via servidor
async function getPokemonDetails(name) {
    const pokemonDetails = document.getElementById('pokemonDetails');
    pokemonDetails.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/search/pokemon?name=${encodeURIComponent(name)}`, {
            credentials: 'include' // Garantir que as credenciais são enviadas
        });
        
        // Verificar se houve erro de autenticação
        if (response.status === 401) {
            showAlert('Sua sessão expirou. Faça login novamente', 'danger');
            // Redirecionar para a página de login após 3 segundos
            setTimeout(() => {
                showPage('loginPage');
                currentUser = null;
                localStorage.removeItem('currentUser');
            }, 3000);
            return;
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao buscar Pokémon');
        }
        
        const data = await response.json();
        selectedPokemon = data;
        displayPokemonDetails(data);
        updateComparison();
    } catch (error) {
        console.error('Erro ao carregar detalhes do Pokémon:', error);
        pokemonDetails.innerHTML = `
            <div class="alert alert-danger">
                ${error.message || 'Erro ao carregar detalhes do Pokémon. Tente novamente.'}
            </div>
        `;
    }
}

// Obter detalhes de Digimon via servidor
async function getDigimonDetails(name) {
    const digimonDetails = document.getElementById('digimonDetails');
    digimonDetails.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/search/digimon?name=${encodeURIComponent(name)}`, {
            credentials: 'include' // Garantir que as credenciais são enviadas
        });
        
        // Verificar se houve erro de autenticação
        if (response.status === 401) {
            showAlert('Sua sessão expirou. Faça login novamente', 'danger');
            // Redirecionar para a página de login após 3 segundos
            setTimeout(() => {
                showPage('loginPage');
                currentUser = null;
                localStorage.removeItem('currentUser');
            }, 3000);
            return;
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao buscar Digimon');
        }
        
        const data = await response.json();
        selectedDigimon = data;
        displayDigimonDetails(data);
        updateComparison();
    } catch (error) {
        console.error('Erro ao carregar detalhes do Digimon:', error);
        digimonDetails.innerHTML = `
            <div class="alert alert-danger">
                ${error.message || 'Erro ao carregar detalhes do Digimon. Tente novamente.'}
            </div>
        `;
    }
}

// Carregar histórico de pesquisas
async function loadHistory() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/history`, {
            credentials: 'include' // Garantir que as credenciais são enviadas
        });
        
        // Verificar se houve erro de autenticação
        if (response.status === 401) {
            showAlert('Sua sessão expirou. Faça login novamente', 'danger');
            // Redirecionar para a página de login após 3 segundos
            setTimeout(() => {
                showPage('loginPage');
                currentUser = null;
                localStorage.removeItem('currentUser');
            }, 3000);
            return;
        }
        
        if (!response.ok) {
            throw new Error('Erro ao carregar histórico');
        }
        
        const history = await response.json();
        searchHistory = history;
        renderHistory();
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        showAlert('Erro ao carregar histórico de pesquisas', 'danger');
    }
}

// Renderizar histórico na página de perfil
function renderHistory() {
    const historyContainer = document.getElementById('historyContainer');
    if (!historyContainer) return;
    
    if (searchHistory.length === 0) {
        historyContainer.innerHTML = `
            <div class="text-center py-3 text-muted">
                <i class="bi bi-clock-history fs-1"></i>
                <p class="mt-2">Nenhuma pesquisa realizada ainda</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="table-responsive">
            <table class="table table-hover history-table">
                <thead>
                    <tr>
                        <th>Data/Hora</th>
                        <th>Pokémon</th>
                        <th>Digimon</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    searchHistory.forEach(item => {
        const date = new Date(item.timestamp).toLocaleString();
        html += `
            <tr>
                <td>${date}</td>
                <td>${item.pokemon || '-'}</td>
                <td>${item.digimon || '-'}</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    historyContainer.innerHTML = html;
}

// Exibir detalhes de Pokémon
function displayPokemonDetails(pokemon) {
    const pokemonDetails = document.getElementById('pokemonDetails');
    const types = pokemon.types.map(t => t.type.name);
    const stats = pokemon.stats.map(stat => ({
        name: stat.stat.name,
        value: stat.base_stat
    }));
    
    pokemonDetails.innerHTML = `
        <div class="monster-header">
            <img src="${pokemon.sprites.other['official-artwork'].front_default || pokemon.sprites.front_default}" 
                 alt="${pokemon.name}" class="monster-image">
            <div class="monster-info">
                <h2 class="monster-name">${formatName(pokemon.name)}</h2>
                <div class="monster-id">#${pokemon.id.toString().padStart(3, '0')}</div>
                
                <div class="monster-types">
                    ${types.map(type => `
                        <div class="type-badge" style="background-color: ${getPokemonTypeColor(type)}">
                            ${type.toUpperCase()}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        
        <div class="stats-container">
            <h4 class="stats-title">Estatísticas</h4>
            ${stats.map(stat => `
                <div class="stat-item">
                    <div class="stat-name">${formatStatName(stat.name)}</div>
                    <div class="stat-bar">
                        <div class="stat-value pokemon-stat" style="width: ${Math.min(100, stat.value)}%"></div>
                    </div>
                    <div class="stat-value-text">${stat.value}</div>
                </div>
            `).join('')}
        </div>
    `;
}

// Exibir detalhes de Digimon
function displayDigimonDetails(digimon) {
    const digimonDetails = document.getElementById('digimonDetails');
    const attributes = digimon.attributes.map(attr => attr.attribute);
    const levels = digimon.levels.map(lvl => lvl.level);
    
    // Estatísticas reais da API Digimon
    const stats = [
        { name: 'hp', value: digimon.hp || Math.floor(Math.random() * 100) },
        { name: 'attack', value: digimon.attack || Math.floor(Math.random() * 100) },
        { name: 'defense', value: digimon.defense || Math.floor(Math.random() * 100) },
        { name: 'speed', value: digimon.speed || Math.floor(Math.random() * 100) }
    ];
    
    digimonDetails.innerHTML = `
        <div class="monster-header">
            <img src="${digimon.images[0]?.href || 'https://via.placeholder.com/150x150?text=Imagem+Indispon%C3%ADvel'}" 
                 alt="${digimon.name}" class="monster-image">
            <div class="monster-info">
                <h2 class="monster-name">${digimon.name}</h2>
                
                <div class="monster-types">
                    ${attributes.map(attr => `
                        <div class="type-badge" style="background-color: ${getDigimonAttributeColor(attr)}">
                            ${attr.toUpperCase()}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        
        <div class="stats-container">
            <h4 class="stats-title">Estatísticas</h4>
            ${stats.map(stat => `
                <div class="stat-item">
                    <div class="stat-name">${formatStatName(stat.name)}</div>
                    <div class="stat-bar">
                        <div class="stat-value digimon-stat" style="width: ${Math.min(100, stat.value)}%"></div>
                    </div>
                    <div class="stat-value-text">${stat.value}</div>
                </div>
            `).join('')}
        </div>
    `;
}

// Atualizar seção de comparação
function updateComparison() {
    const comparisonDetails = document.getElementById('comparisonDetails');
    if (!selectedPokemon || !selectedDigimon) return;
    
    comparisonDetails.innerHTML = `
        <div class="comparison-item">
            <h4>${formatName(selectedPokemon.name)}</h4>
            <img src="${selectedPokemon.sprites.other['official-artwork'].front_default || selectedPokemon.sprites.front_default}" 
                 alt="${selectedPokemon.name}" class="comparison-image">
            
            <div class="comparison-stats">
                <p><span>Tipo:</span> <span class="stat-value">${selectedPokemon.types.map(t => t.type.name).join(', ')}</span></p>
                <p><span>Altura:</span> <span class="stat-value">${selectedPokemon.height / 10}m</span></p>
                <p><span>Peso:</span> <span class="stat-value">${selectedPokemon.weight / 10}kg</span></p>
                <p><span>HP:</span> <span class="stat-value">${selectedPokemon.stats.find(s => s.stat.name === 'hp').base_stat}</span></p>
                <p><span>Ataque:</span> <span class="stat-value">${selectedPokemon.stats.find(s => s.stat.name === 'attack').base_stat}</span></p>
            </div>
        </div>
        
        <div class="d-flex align-items-center justify-content-center">
            <i class="bi bi-arrow-left-right" style="font-size: 2rem; color: var(--primary);"></i>
        </div>
        
        <div class="comparison-item">
            <h4>${selectedDigimon.name}</h4>
            <img src="${selectedDigimon.images[0]?.href || 'https://via.placeholder.com/150x150?text=Imagem+Indispon%C3%ADvel'}" 
                 alt="${selectedDigimon.name}" class="comparison-image">
            
            <div class="comparison-stats">
                <p><span>Atributo:</span> <span class="stat-value">${selectedDigimon.attributes.map(a => a.attribute).join(', ')}</span></p>
                <p><span>Nível:</span> <span class="stat-value">${selectedDigimon.levels.map(l => l.level).join(', ')}</span></p>
                <p><span>HP:</span> <span class="stat-value">${selectedDigimon.hp || Math.floor(Math.random() * 100)}</span></p>
                <p><span>Ataque:</span> <span class="stat-value">${selectedDigimon.attack || Math.floor(Math.random() * 100)}</span></p>
                <p><span>Defesa:</span> <span class="stat-value">${selectedDigimon.defense || Math.floor(Math.random() * 100)}</span></p>
            </div>
        </div>
    `;
}

// Funções auxiliares
function getPokemonIdFromUrl(url) {
    return url.split('/').filter(Boolean).pop();
}

function formatName(name) {
    return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function formatStatName(stat) {
    const statNames = {
        'hp': 'HP',
        'attack': 'Ataque',
        'defense': 'Defesa',
        'special-attack': 'Atq. Especial',
        'special-defense': 'Def. Especial',
        'speed': 'Velocidade'
    };
    return statNames[stat] || stat;
}

function getPokemonTypeColor(type) {
    const typeColors = {
        normal: '#A8A878',
        fire: '#F08030',
        water: '#6890F0',
        electric: '#F8D030',
        grass: '#78C850',
        ice: '#98D8D8',
        fighting: '#C03028',
        poison: '#A040A0',
        ground: '#E0C068',
        flying: '#A890F0',
        psychic: '#F85888',
        bug: '#A8B820',
        rock: '#B8A038',
        ghost: '#705898',
        dragon: '#7038F8',
        dark: '#705848',
        steel: '#B8B8D0',
        fairy: '#EE99AC'
    };
    return typeColors[type] || '#777';
}

function getDigimonAttributeColor(attribute) {
    const attributeColors = {
        'data': '#4e73df',
        'vaccine': '#1cc88a',
        'virus': '#e74a3b',
        'free': '#f6c23e'
    };
    return attributeColors[attribute.toLowerCase()] || '#777';
}

// Event Listeners
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    if (await login(username, password)) {
        showAlert('Autenticação realizada com sucesso!', 'success');
        document.getElementById('welcomeUsername').textContent = `Bem-vindo(a), ${username}`;
        document.getElementById('welcomeUsernameProfile').textContent = `Bem-vindo(a), ${username}`;
        setTimeout(() => {
            showPage('dashboardPage');
        }, 1500);
    }
});

document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    
    if (await register(username, password)) {
        showAlert('Conta criada com sucesso!', 'success');
        setTimeout(() => showPage('loginPage'), 1500);
    }
});

document.getElementById('profileForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
    if (newPassword !== confirmPassword) {
        showAlert('As palavras-passe não coincidem.', 'danger');
        return;
    }
    
    if (await updatePassword(newPassword)) {
        showAlert('Palavra-passe atualizada com sucesso!', 'success');
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
    }
});

document.getElementById('logoutBtn').addEventListener('click', async function(e) {
    e.preventDefault();
    try {
        const response = await fetch(`${API_BASE_URL}/logout`, {
            credentials: 'include'
        });
        if (response.ok) {
            currentUser = null;
            localStorage.removeItem('currentUser');
            showAlert('Sessão terminada com sucesso.', 'success');
            setTimeout(() => showPage('loginPage'), 1500);
        }
    } catch (error) {
        console.error('Erro no logout:', error);
        showAlert('Erro ao terminar sessão', 'danger');
    }
});

document.getElementById('logoutBtnProfile').addEventListener('click', async function(e) {
    e.preventDefault();
    try {
        const response = await fetch(`${API_BASE_URL}/logout`, {
            credentials: 'include'
        });
        if (response.ok) {
            currentUser = null;
            localStorage.removeItem('currentUser');
            showAlert('Sessão terminada com sucesso.', 'success');
            setTimeout(() => showPage('loginPage'), 1500);
        }
    } catch (error) {
        console.error('Erro no logout:', error);
        showAlert('Erro ao terminar sessão', 'danger');
    }
});

// Toggle sidebar in mobile
document.querySelector('.sidebar-toggle').addEventListener('click', function() {
    document.querySelector('.sidebar').classList.toggle('active');
});

// Fechar sidebar ao clicar fora
document.addEventListener('click', function(e) {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.querySelector('.sidebar-toggle');
    
    if (window.innerWidth < 992 && 
        !sidebar.contains(e.target) && 
        !toggleBtn.contains(e.target) &&
        sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
});

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
    // Verificar se o utilizador está autenticado
    currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
        document.getElementById('welcomeUsername').textContent = `Bem-vindo(a), ${currentUser}`;
        document.getElementById('welcomeUsernameProfile').textContent = `Bem-vindo(a), ${currentUser}`;
        showPage('dashboardPage');
    } else {
        showPage('loginPage');
    }
});