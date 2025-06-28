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
    
    // Wait for modals to be added to DOM
    setTimeout(() => {
        const accountForm = document.getElementById('accountForm');
        const categoryForm = document.getElementById('categoryForm');
        const scheduleForm = document.getElementById('scheduleForm');
        
        if (accountForm) accountForm.addEventListener('submit', handleAddAccount);
        if (categoryForm) categoryForm.addEventListener('submit', handleAddCategory);
        if (scheduleForm) scheduleForm.addEventListener('submit', handleAddSchedule);
    }, 100);
});

// Event delegation для всех кнопок
document.addEventListener('click', async function(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    const id = e.target.closest('[data-action]')?.dataset.id;
    
    if (!action || !id) return;
    
    switch (action) {
        case 'edit-video':
            editVideo(parseInt(id));
            break;
        case 'delete-video':
            await deleteVideo(parseInt(id));
            break;
        case 'toggle-account':
            const isActive = e.target.closest('[data-action]').dataset.active === 'true';
            await toggleAccount(parseInt(id), isActive);
            break;
        case 'delete-account':
            await deleteAccount(parseInt(id));
            break;
        case 'edit-category':
            editCategory(parseInt(id));
            break;
        case 'delete-category':
            await deleteCategory(parseInt(id));
            break;
        case 'edit-schedule':
            editSchedule(parseInt(id));
            break;
        case 'delete-schedule':
            await deleteSchedule(parseInt(id));
            break;
        case 'toggle-schedule':
            const scheduleActive = e.target.closest('[data-action]').dataset.active === 'true';
            await toggleSchedule(parseInt(id), scheduleActive);
            break;
    }
});

// Enhanced makeRequest with loading states
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

// Enhanced authentication functions
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

async function handleLogin(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    // Show loading state
    submitBtn.innerHTML = '<span class="loading-spinner me-2"></span>Signing in...';
    submitBtn.disabled = true;
    
    const formData = new FormData(e.target);
    
    try {
        const response = await makeRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                email: formData.get('email'),
                password: formData.get('password')
            })
        });

        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            currentUser = data.user;
            showDashboard();
        } else {
            showNotification(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        showNotification('Login failed: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
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
    loadSchedules();
}

// Enhanced loading functions with modern UI
async function loadVideos() {
    try {
        showLoadingState('videosTable');
        const response = await makeRequest('/videos');
        
        if (!response.ok) {
            throw new Error('Failed to load videos');
        }
        
        const data = await response.json();
        
        const table = `
            <div class="table-modern">
                <table class="table table-dark table-hover mb-0">
                    <thead>
                        <tr>
                            <th><i class="fas fa-video me-2"></i>Title</th>
                            <th><i class="fas fa-tags me-2"></i>Category</th>
                            <th><i class="fas fa-info-circle me-2"></i>Status</th>
                            <th><i class="fas fa-clock me-2"></i>Duration</th>
                            <th><i class="fas fa-calendar me-2"></i>Created</th>
                            <th><i class="fas fa-cog me-2"></i>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.videos.map(video => `
                            <tr>
                                <td>
                                    <div class="d-flex align-items-center">
                                        <i class="fas fa-video text-primary me-2"></i>
                                        <strong>${video.title}</strong>
                                    </div>
                                </td>
                                <td>
                                    ${video.Category ? 
                                        `<span class="badge rounded-pill" style="background: ${video.Category.color}; color: #000">${video.Category.name}</span>` 
                                        : '<span class="text-muted">No category</span>'
                                    }
                                </td>
                                <td>
                                    <span class="status-badge status-${video.status}">${video.status}</span>
                                </td>
                                <td>${video.duration ? Math.round(video.duration) + 's' : '-'}</td>
                                <td>${new Date(video.createdAt).toLocaleDateString()}</td>
                                <td>
                                    <button class="action-btn action-btn-edit" data-action="edit-video" data-id="${video.id}" title="Edit">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="action-btn action-btn-delete" data-action="delete-video" data-id="${video.id}" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        document.getElementById('videosTable').innerHTML = table;
    } catch (error) {
        showNotification('Error loading videos: ' + error.message, 'error');
        document.getElementById('videosTable').innerHTML = '<div class="text-center p-4 text-muted">Failed to load videos</div>';
    }
}

async function loadSchedules() {
    try {
        showLoadingState('schedulesTable');
        const response = await makeRequest('/schedules');
        
        if (!response.ok) {
            throw new Error('Failed to load schedules');
        }
        
        const schedules = await response.json();
        
        const table = `
            <div class="table-modern">
                <table class="table table-dark table-hover mb-0">
                    <thead>
                        <tr>
                            <th><i class="fas fa-calendar-check me-2"></i>Name</th>
                            <th><i class="fas fa-tags me-2"></i>Category</th>
                            <th><i class="fas fa-clock me-2"></i>Schedule</th>
                            <th><i class="fas fa-chart-line me-2"></i>Limits</th>
                            <th><i class="fas fa-toggle-on me-2"></i>Status</th>
                            <th><i class="fas fa-cog me-2"></i>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${schedules.map(schedule => `
                            <tr>
                                <td>
                                    <div class="d-flex align-items-center">
                                        <i class="fas fa-calendar-alt text-primary me-2"></i>
                                        <strong>${schedule.name}</strong>
                                    </div>
                                </td>
                                <td>
                                    ${schedule.Category ? 
                                        `<span class="badge rounded-pill" style="background: ${schedule.Category.color}; color: #000">${schedule.Category.name}</span>` 
                                        : '<span class="text-muted">All categories</span>'
                                    }
                                </td>
                                <td>
                                    <small class="text-muted">
                                        ${formatSchedule(schedule.schedule)}
                                    </small>
                                </td>
                                <td>
                                    <div class="d-flex flex-column">
                                        <small><i class="fas fa-calendar-day me-1"></i>${schedule.maxPostsPerDay}/day</small>
                                        <small><i class="fas fa-clock me-1"></i>${schedule.maxPostsPerHour}/hour</small>
                                    </div>
                                </td>
                                <td>
                                    <span class="status-badge ${schedule.isActive ? 'status-published' : 'status-failed'}">
                                        ${schedule.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>
                                    <button class="action-btn action-btn-toggle" data-action="toggle-schedule" data-id="${schedule.id}" data-active="${!schedule.isActive}" title="${schedule.isActive ? 'Deactivate' : 'Activate'}">
                                        <i class="fas fa-${schedule.isActive ? 'pause' : 'play'}"></i>
                                    </button>
                                    <button class="action-btn action-btn-edit" data-action="edit-schedule" data-id="${schedule.id}" title="Edit">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="action-btn action-btn-delete" data-action="delete-schedule" data-id="${schedule.id}" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        document.getElementById('schedulesTable').innerHTML = table;
    } catch (error) {
        showNotification('Error loading schedules: ' + error.message, 'error');
        document.getElementById('schedulesTable').innerHTML = '<div class="text-center p-4 text-muted">Failed to load schedules</div>';
    }
}

async function loadAccounts() {
    try {
        showLoadingState('accountsTable');
        const response = await makeRequest('/accounts');
        
        if (!response.ok) {
            throw new Error('Failed to load accounts');
        }
        
        const accounts = await response.json();
        
        const table = `
            <div class="table-modern">
                <table class="table table-dark table-hover mb-0">
                    <thead>
                        <tr>
                            <th><i class="fab fa-tiktok me-2"></i>Account Name</th>
                            <th><i class="fas fa-user me-2"></i>TikTok User ID</th>
                            <th><i class="fas fa-toggle-on me-2"></i>Status</th>
                            <th><i class="fas fa-clock me-2"></i>Last Publish</th>
                            <th><i class="fas fa-cog me-2"></i>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${accounts.map(account => `
                            <tr>
                                <td>
                                    <div class="d-flex align-items-center">
                                        <i class="fab fa-tiktok text-danger me-2"></i>
                                        <strong>${account.accountName}</strong>
                                    </div>
                                </td>
                                <td><code>${account.tiktokUserId}</code></td>
                                <td>
                                    <span class="status-badge ${account.isActive ? 'status-published' : 'status-failed'}">
                                        ${account.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>${account.lastPublishAt ? new Date(account.lastPublishAt).toLocaleDateString() : 'Never'}</td>
                                <td>
                                    <button class="action-btn action-btn-toggle" data-action="toggle-account" data-id="${account.id}" data-active="${!account.isActive}" title="${account.isActive ? 'Deactivate' : 'Activate'}">
                                        <i class="fas fa-${account.isActive ? 'pause' : 'play'}"></i>
                                    </button>
                                    <button class="action-btn action-btn-delete" data-action="delete-account" data-id="${account.id}" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        document.getElementById('accountsTable').innerHTML = table;
    } catch (error) {
        showNotification('Error loading accounts: ' + error.message, 'error');
        document.getElementById('accountsTable').innerHTML = '<div class="text-center p-4 text-muted">Failed to load accounts</div>';
    }
}

async function loadCategories() {
    try {
        showLoadingState('categoriesTable');
        const response = await makeRequest('/categories');
        
        if (!response.ok) {
            throw new Error('Failed to load categories');
        }
        
        const categories = await response.json();
        
        // Update category selects
        const categorySelects = document.querySelectorAll('#categoryFilter, #uploadCategorySelect, #scheduleCategorySelect');
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
            <div class="table-modern">
                <table class="table table-dark table-hover mb-0">
                    <thead>
                        <tr>
                            <th><i class="fas fa-tag me-2"></i>Name</th>
                            <th><i class="fas fa-align-left me-2"></i>Description</th>
                            <th><i class="fas fa-palette me-2"></i>Color</th>
                            <th><i class="fas fa-cog me-2"></i>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${categories.map(category => `
                            <tr>
                                <td>
                                    <div class="d-flex align-items-center">
                                        <i class="fas fa-tag me-2" style="color: ${category.color}"></i>
                                        <strong>${category.name}</strong>
                                    </div>
                                </td>
                                <td>${category.description || '<span class="text-muted">No description</span>'}</td>
                                <td>
                                    <div class="d-flex align-items-center">
                                        <div class="rounded-circle me-2" style="width: 20px; height: 20px; background: ${category.color}"></div>
                                        <code>${category.color}</code>
                                    </div>
                                </td>
                                <td>
                                    <button class="action-btn action-btn-edit" data-action="edit-category" data-id="${category.id}" title="Edit">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="action-btn action-btn-delete" data-action="delete-category" data-id="${category.id}" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        document.getElementById('categoriesTable').innerHTML = table;
    } catch (error) {
        showNotification('Error loading categories: ' + error.message, 'error');
        document.getElementById('categoriesTable').innerHTML = '<div class="text-center p-4 text-muted">Failed to load categories</div>';
    }
}

// Form handlers
async function handleUpload(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    submitBtn.innerHTML = '<span class="loading-spinner me-2"></span>Uploading...';
    submitBtn.disabled = true;
    
    const formData = new FormData(e.target);
    
    try {
        const response = await makeRequest('/videos/upload', {
            method: 'POST',
            headers: {},
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide();
            e.target.reset();
            loadVideos();
            showNotification('Video uploaded successfully!', 'success');
        } else {
            showNotification(data.error || 'Upload failed', 'error');
        }
    } catch (error) {
        showNotification('Upload failed: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function handleAddAccount(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    submitBtn.innerHTML = '<span class="loading-spinner me-2"></span>Adding...';
    submitBtn.disabled = true;
    
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
            showNotification('Account added successfully!', 'success');
        } else {
            showNotification(data.error || 'Failed to add account', 'error');
        }
    } catch (error) {
        showNotification('Failed to add account: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function handleAddCategory(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    submitBtn.innerHTML = '<span class="loading-spinner me-2"></span>Creating...';
    submitBtn.disabled = true;
    
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
            showNotification('Category created successfully!', 'success');
        } else {
            showNotification(data.error || 'Failed to create category', 'error');
        }
    } catch (error) {
        showNotification('Failed to create category: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function handleAddSchedule(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    submitBtn.innerHTML = '<span class="loading-spinner me-2"></span>Creating...';
    submitBtn.disabled = true;
    
    const formData = new FormData(e.target);
    
    // Build schedule object
    const selectedDays = Array.from(e.target.querySelectorAll('input[name="days[]"]:checked')).map(cb => parseInt(cb.value));
    const selectedHours = Array.from(e.target.querySelectorAll('input[name="hours[]"]:checked')).map(cb => parseInt(cb.value));
    
    const schedule = {
        days: selectedDays,
        hours: selectedHours
    };
    
    try {
        const response = await makeRequest('/schedules', {
            method: 'POST',
            body: JSON.stringify({
                name: formData.get('name'),
                categoryId: formData.get('categoryId') || null,
                schedule: schedule,
                maxPostsPerDay: parseInt(formData.get('maxPostsPerDay')),
                maxPostsPerHour: parseInt(formData.get('maxPostsPerHour')),
                minIntervalMinutes: parseInt(formData.get('minIntervalMinutes')),
                timezone: formData.get('timezone')
            })
        });

        const data = await response.json();

        if (response.ok) {
            bootstrap.Modal.getInstance(document.getElementById('scheduleModal')).hide();
            e.target.reset();
            loadSchedules();
            showNotification('Schedule created successfully!', 'success');
        } else {
            showNotification(data.error || 'Failed to create schedule', 'error');
        }
    } catch (error) {
        showNotification('Failed to create schedule: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Modal functions
function showUploadModal() {
    if (!document.getElementById('uploadModal')) {
        createModals();
    }
    new bootstrap.Modal(document.getElementById('uploadModal')).show();
}

function showAccountModal() {
    if (!document.getElementById('accountModal')) {
        createModals();
    }
    new bootstrap.Modal(document.getElementById('accountModal')).show();
}

function showCategoryModal() {
    if (!document.getElementById('categoryModal')) {
        createModals();
    }
    new bootstrap.Modal(document.getElementById('categoryModal')).show();
}

function showScheduleModal() {
    if (!document.getElementById('scheduleModal')) {
        createModals();
    }
    new bootstrap.Modal(document.getElementById('scheduleModal')).show();
}

// Utility functions
function showLoadingState(elementId) {
    document.getElementById(elementId).innerHTML = `
        <div class="text-center p-5">
            <div class="loading-spinner me-2" style="width: 40px; height: 40px;"></div>
            <div class="mt-3 text-muted">Loading...</div>
        </div>
    `;
}

function formatSchedule(schedule) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayNames = schedule.days ? schedule.days.map(d => days[d]).join(', ') : 'Daily';
    const hours = schedule.hours ? schedule.hours.join(', ') : 'Any time';
    return `${dayNames} at ${hours}`;
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// CRUD functions
function editVideo(id) {
    showNotification('Edit video functionality coming soon!', 'info');
}

function editCategory(id) {
    showNotification('Edit category functionality coming soon!', 'info');
}

function editSchedule(id) {
    showNotification('Edit schedule functionality coming soon!', 'info');
}

async function deleteVideo(id) {
    if (confirm('Are you sure you want to delete this video?')) {
        try {
            const response = await makeRequest(`/videos/${id}`, { method: 'DELETE' });
            const data = await response.json();
            
            if (response.ok) {
                loadVideos();
                showNotification('Video deleted successfully!', 'success');
            } else {
                showNotification(data.error || 'Failed to delete video', 'error');
            }
        } catch (error) {
            showNotification('Failed to delete video: ' + error.message, 'error');
        }
    }
}

async function deleteAccount(id) {
    if (confirm('Are you sure you want to delete this account?')) {
        try {
            const response = await makeRequest(`/accounts/${id}`, { method: 'DELETE' });
            const data = await response.json();
            
            if (response.ok) {
                loadAccounts();
                showNotification('Account deleted successfully!', 'success');
            } else {
                showNotification(data.error || 'Failed to delete account', 'error');
            }
        } catch (error) {
            showNotification('Failed to delete account: ' + error.message, 'error');
        }
    }
}

async function deleteCategory(id) {
    if (confirm('Are you sure you want to delete this category?')) {
        try {
            const response = await makeRequest(`/categories/${id}`, { method: 'DELETE' });
            const data = await response.json();
            
            if (response.ok) {
                loadCategories();
                showNotification('Category deleted successfully!', 'success');
            } else {
                showNotification(data.error || 'Failed to delete category', 'error');
            }
        } catch (error) {
            showNotification('Failed to delete category: ' + error.message, 'error');
        }
    }
}

async function deleteSchedule(id) {
    if (confirm('Are you sure you want to delete this schedule?')) {
        try {
            const response = await makeRequest(`/schedules/${id}`, { method: 'DELETE' });
            const data = await response.json();
            
            if (response.ok) {
                loadSchedules();
                showNotification('Schedule deleted successfully!', 'success');
            } else {
                showNotification(data.error || 'Failed to delete schedule', 'error');
            }
        } catch (error) {
            showNotification('Failed to delete schedule: ' + error.message, 'error');
        }
    }
}

async function toggleAccount(id, isActive) {
    try {
        const response = await makeRequest(`/accounts/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ isActive })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            loadAccounts();
            showNotification(`Account ${isActive ? 'activated' : 'deactivated'} successfully!`, 'success');
        } else {
            showNotification(data.error || 'Failed to update account', 'error');
        }
    } catch (error) {
        showNotification('Failed to update account: ' + error.message, 'error');
    }
}

async function toggleSchedule(id, isActive) {
    try {
        const response = await makeRequest(`/schedules/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ isActive })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            loadSchedules();
            showNotification(`Schedule ${isActive ? 'activated' : 'deactivated'} successfully!`, 'success');
        } else {
            showNotification(data.error || 'Failed to update schedule', 'error');
        }
    } catch (error) {
        showNotification('Failed to update schedule: ' + error.message, 'error');
    }
}

// Create additional modals dynamically
function createModals() {
    const modalsHTML = `
        <!-- Account Modal -->
        <div class="modal fade" id="accountModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="fab fa-tiktok me-2"></i>Add TikTok Account</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="accountForm">
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Account Name</label>
                                <input type="text" class="form-control" name="accountName" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Access Token</label>
                                <textarea class="form-control" name="accessToken" rows="3" required></textarea>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Refresh Token (optional)</label>
                                <textarea class="form-control" name="refreshToken" rows="2"></textarea>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="submit" class="btn btn-gradient">
                                <i class="fas fa-plus me-2"></i>Add Account
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- Category Modal -->
        <div class="modal fade" id="categoryModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="fas fa-tags me-2"></i>Add Category</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="categoryForm">
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Name</label>
                                <input type="text" class="form-control" name="name" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Description</label>
                                <textarea class="form-control" name="description" rows="3"></textarea>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Color</label>
                                <input type="color" class="form-control" name="color" value="#667eea">
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="submit" class="btn btn-gradient">
                                <i class="fas fa-plus me-2"></i>Add Category
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- Schedule Modal -->
        <div class="modal fade" id="scheduleModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="fas fa-calendar-check me-2"></i>Create Publish Schedule</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="scheduleForm">
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Schedule Name</label>
                                    <input type="text" class="form-control" name="name" required>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Category</label>
                                    <select class="form-select" name="categoryId" id="scheduleCategorySelect">
                                        <option value="">All Categories</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Days of Week</label>
                                <div class="d-flex flex-wrap gap-2">
                                    ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => `
                                        <div class="form-check">
                                            <input class="form-check-input" type="checkbox" name="days[]" value="${index}" id="day${index}">
                                            <label class="form-check-label" for="day${index}">${day.slice(0, 3)}</label>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Hours (24h format)</label>
                                <div class="d-flex flex-wrap gap-2">
                                    ${Array.from({length: 24}, (_, i) => `
                                        <div class="form-check">
                                            <input class="form-check-input" type="checkbox" name="hours[]" value="${i}" id="hour${i}">
                                            <label class="form-check-label" for="hour${i}">${i.toString().padStart(2, '0')}:00</label>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <label class="form-label">Max Posts per Day</label>
                                    <input type="number" class="form-control" name="maxPostsPerDay" value="5" min="1" max="50">
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label">Max Posts per Hour</label>
                                    <input type="number" class="form-control" name="maxPostsPerHour" value="1" min="1" max="10">
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label">Min Interval (minutes)</label>
                                    <input type="number" class="form-control" name="minIntervalMinutes" value="30" min="1" max="1440">
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Timezone</label>
                                <select class="form-select" name="timezone">
                                    <option value="UTC">UTC</option>
                                    <option value="America/New_York">Eastern Time</option>
                                    <option value="America/Chicago">Central Time</option>
                                    <option value="America/Denver">Mountain Time</option>
                                    <option value="America/Los_Angeles">Pacific Time</option>
                                    <option value="Europe/London">London</option>
                                    <option value="Europe/Moscow">Moscow</option>
                                    <option value="Asia/Tokyo">Tokyo</option>
                                </select>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="submit" class="btn btn-gradient">
                                <i class="fas fa-calendar-plus me-2"></i>Create Schedule
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalsHTML);
}