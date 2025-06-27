const API_BASE = '/api';
let currentUser = null;
let authToken = localStorage.getItem('authToken');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    if (authToken) {
        checkAuth();
    } else {
        showLoginForm();
    }

    // Event listeners
    document.getElementById('login').addEventListener('submit', handleLogin);
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);
    document.getElementById('accountForm').addEventListener('submit', handleAddAccount);
    document.getElementById('categoryForm').addEventListener('submit', handleAddCategory);
});

// ✅ Исправленная функция makeRequest
async function makeRequest(url, options = {}) {
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    if (authToken) {
        config.headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(API_BASE + url, config);
    
    if (response.status === 401) {
        logout();
        throw new Error('Unauthorized');
    }

    return response;
}

async function checkAuth() {
    try {
        const response = await makeRequest('/auth/me');
        if (response.ok) {
            currentUser = await response.json();
            showDashboard();
        } else {
            showLoginForm();
        }
    } catch (error) {
        showLoginForm();
    }
}

// ✅ Исправленная функция handleLogin
async function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    try {
        const response = await makeRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                email: formData.get('email'),
                password: formData.get('password')
            })
        });

        // Читаем JSON только один раз
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            currentUser = data.user;
            showDashboard();
        } else {
            // data уже содержит parsed JSON
            alert(data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed: ' + error.message);
    }
}

function logout() {
    authToken = null;
    localStorage.removeItem('authToken');
    currentUser = null;
    showLoginForm();
}

function showLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
}

function showDashboard() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadVideos();
    loadAccounts();
    loadCategories();
}

async function loadVideos() {
    try {
        const response = await makeRequest('/videos');
        
        if (!response.ok) {
            throw new Error('Failed to load videos');
        }
        
        const data = await response.json();
        
        const table = `
            <table class="table table-striped">
                <thead class="table-dark">
                    <tr>
                        <th>Title</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.videos.map(video => `
                        <tr>
                            <td>${video.title}</td>
                            <td>
                                ${video.Category ? 
                                    `<span class="badge" style="background-color: ${video.Category.color}">${video.Category.name}</span>` 
                                    : '-'
                                }
                            </td>
                            <td>
                                <span class="badge bg-${getStatusColor(video.status)}">${video.status}</span>
                            </td>
                            <td>${video.duration ? Math.round(video.duration) + 's' : '-'}</td>
                            <td>${new Date(video.createdAt).toLocaleDateString()}</td>
                            <td>
                                <button class="btn btn-sm btn-outline-primary" onclick="editVideo(${video.id})">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="deleteVideo(${video.id})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        document.getElementById('videosTable').innerHTML = table;
    } catch (error) {
        console.error('Error loading videos:', error);
    }
}

async function loadAccounts() {
    try {
        const response = await makeRequest('/accounts');
        
        if (!response.ok) {
            throw new Error('Failed to load accounts');
        }
        
        const accounts = await response.json();
        
        const table = `
            <table class="table table-striped">
                <thead class="table-dark">
                    <tr>
                        <th>Account Name</th>
                        <th>TikTok User ID</th>
                        <th>Status</th>
                        <th>Last Publish</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${accounts.map(account => `
                        <tr>
                            <td>${account.accountName}</td>
                            <td>${account.tiktokUserId}</td>
                            <td>
                                <span class="badge bg-${account.isActive ? 'success' : 'secondary'}">
                                    ${account.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </td>
                            <td>${account.lastPublishAt ? new Date(account.lastPublishAt).toLocaleDateString() : 'Never'}</td>
                            <td>
                                <button class="btn btn-sm btn-outline-primary" onclick="toggleAccount(${account.id}, ${!account.isActive})">
                                    <i class="fas fa-${account.isActive ? 'pause' : 'play'}"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="deleteAccount(${account.id})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        document.getElementById('accountsTable').innerHTML = table;
    } catch (error) {
        console.error('Error loading accounts:', error);
    }
}

async function loadCategories() {
    try {
        const response = await makeRequest('/categories');
        
        if (!response.ok) {
            throw new Error('Failed to load categories');
        }
        
        const categories = await response.json();
        
        // Update category selects
        const categorySelects = document.querySelectorAll('#categoryFilter, #uploadCategorySelect');
        categorySelects.forEach(select => {
            if (select.id === 'categoryFilter') {
                select.innerHTML = '<option value="">All Categories</option>';
            } else {
                select.innerHTML = '<option value="">Select Category</option>';
            }
            
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                select.appendChild(option);
            });
        });
        
        const table = `
            <table class="table table-striped">
                <thead class="table-dark">
                    <tr>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Color</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${categories.map(category => `
                        <tr>
                            <td>${category.name}</td>
                            <td>${category.description || '-'}</td>
                            <td>
                                <span class="badge" style="background-color: ${category.color}">
                                    ${category.color}
                                </span>
                            </td>
                            <td>
                                <button class="btn btn-sm btn-outline-primary" onclick="editCategory(${category.id})">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="deleteCategory(${category.id})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        document.getElementById('categoriesTable').innerHTML = table;
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// ✅ Исправленная функция handleUpload
async function handleUpload(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    try {
        const response = await makeRequest('/videos/upload', {
            method: 'POST',
            headers: {}, // Remove Content-Type to let browser set it for FormData
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide();
            e.target.reset();
            loadVideos();
            alert('Video uploaded successfully!');
        } else {
            alert(data.error || 'Upload failed');
        }
    } catch (error) {
        alert('Upload failed: ' + error.message);
    }
}

// ✅ Исправленная функция handleAddAccount
async function handleAddAccount(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    try {
        const response = await makeRequest('/accounts', {
            method: 'POST',
            body: JSON.stringify({
                accountName: formData.get('accountName'),
                accessToken: formData.get('accessToken'),
                refreshToken: formData.get('refreshToken')
            })
        });

        const data = await response.json();

        if (response.ok) {
            bootstrap.Modal.getInstance(document.getElementById('accountModal')).hide();
            e.target.reset();
            loadAccounts();
            alert('Account added successfully!');
        } else {
            alert(data.error || 'Failed to add account');
        }
    } catch (error) {
        alert('Failed to add account: ' + error.message);
    }
}

// ✅ Исправленная функция handleAddCategory
async function handleAddCategory(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    try {
        const response = await makeRequest('/categories', {
            method: 'POST',
            body: JSON.stringify({
                name: formData.get('name'),
                description: formData.get('description'),
                color: formData.get('color')
            })
        });

        const data = await response.json();

        if (response.ok) {
            bootstrap.Modal.getInstance(document.getElementById('categoryModal')).hide();
            e.target.reset();
            loadCategories();
            alert('Category added successfully!');
        } else {
            alert(data.error || 'Failed to add category');
        }
    } catch (error) {
        alert('Failed to add category: ' + error.message);
    }
}

function showUploadModal() {
    new bootstrap.Modal(document.getElementById('uploadModal')).show();
}

function showAccountModal() {
    new bootstrap.Modal(document.getElementById('accountModal')).show();
}

function showCategoryModal() {
    new bootstrap.Modal(document.getElementById('categoryModal')).show();
}

function getStatusColor(status) {
    switch (status) {
        case 'pending': return 'warning';
        case 'published': return 'success';
        case 'failed': return 'danger';
        case 'archived': return 'secondary';
        default: return 'primary';
    }
}

async function deleteVideo(id) {
    if (confirm('Are you sure you want to delete this video?')) {
        try {
            const response = await makeRequest(`/videos/${id}`, { method: 'DELETE' });
            if (response.ok) {
                loadVideos();
                alert('Video deleted successfully!');
            }
        } catch (error) {
            alert('Failed to delete video: ' + error.message);
        }
    }
}

async function deleteAccount(id) {
    if (confirm('Are you sure you want to delete this account?')) {
        try {
            const response = await makeRequest(`/accounts/${id}`, { method: 'DELETE' });
            if (response.ok) {
                loadAccounts();
                alert('Account deleted successfully!');
            }
        } catch (error) {
            alert('Failed to delete account: ' + error.message);
        }
    }
}

async function deleteCategory(id) {
    if (confirm('Are you sure you want to delete this category?')) {
        try {
            const response = await makeRequest(`/categories/${id}`, { method: 'DELETE' });
            if (response.ok) {
                loadCategories();
                alert('Category deleted successfully!');
            }
        } catch (error) {
            alert('Failed to delete category: ' + error.message);
        }
    }
}

async function toggleAccount(id, isActive) {
    try {
        const response = await makeRequest(`/accounts/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ isActive })
        });
        if (response.ok) {
            loadAccounts();
        }
    } catch (error) {
        alert('Failed to update account: ' + error.message);
    }
}