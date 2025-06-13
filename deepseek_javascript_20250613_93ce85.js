document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const taskInput = document.getElementById('task-input');
    const addTaskBtn = document.getElementById('add-task-btn');
    const taskList = document.getElementById('task-list');
    const categoryList = document.getElementById('category-list');
    const addCategoryBtn = document.getElementById('add-category-btn');
    const categoryModal = document.getElementById('category-modal');
    const closeModal = document.querySelector('.close-modal');
    const saveCategoryBtn = document.getElementById('save-category-btn');
    const newCategoryInput = document.getElementById('new-category-input');
    const iconOptions = document.querySelectorAll('.icon-options i');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const clearCompletedBtn = document.getElementById('clear-completed-btn');
    const totalTasksSpan = document.getElementById('total-tasks');
    const completedTasksSpan = document.getElementById('completed-tasks');

    // State
    let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
    let categories = JSON.parse(localStorage.getItem('categories')) || [
        { name: 'work', icon: 'briefcase' },
        { name: 'personal', icon: 'home' },
        { name: 'health', icon: 'heartbeat' }
    ];
    let selectedCategory = 'all';
    let selectedFilter = 'all';
    let selectedIcon = 'briefcase';

    // Initialize the app
    function init() {
        renderCategories();
        renderTasks();
        updateStats();
    }

    // Render categories in the sidebar
    function renderCategories() {
        categoryList.innerHTML = '';
        
        // Add "All Tasks" category
        const allCategoryItem = document.createElement('li');
        allCategoryItem.textContent = 'All Tasks';
        allCategoryItem.dataset.category = 'all';
        if (selectedCategory === 'all') allCategoryItem.classList.add('active');
        allCategoryItem.addEventListener('click', () => {
            setActiveCategory('all');
        });
        categoryList.appendChild(allCategoryItem);

        // Add other categories
        categories.forEach(category => {
            const categoryItem = document.createElement('li');
            categoryItem.dataset.category = category.name;
            if (selectedCategory === category.name) categoryItem.classList.add('active');
            
            const icon = document.createElement('i');
            icon.className = `fas fa-${category.icon}`;
            categoryItem.appendChild(icon);
            
            const categoryName = document.createElement('span');
            categoryName.textContent = category.name.charAt(0).toUpperCase() + category.name.slice(1);
            categoryItem.appendChild(categoryName);
            
            categoryItem.addEventListener('click', () => {
                setActiveCategory(category.name);
            });
            
            categoryList.appendChild(categoryItem);
        });
    }

    // Set active category
    function setActiveCategory(category) {
        selectedCategory = category;
        document.querySelectorAll('#category-list li').forEach(item => {
            item.classList.toggle('active', item.dataset.category === category);
        });
        renderTasks();
    }

    // Render tasks based on current filter and category
    function renderTasks() {
        taskList.innerHTML = '';
        
        let filteredTasks = tasks;
        
        // Filter by category
        if (selectedCategory !== 'all') {
            filteredTasks = filteredTasks.filter(task => task.category === selectedCategory);
        }
        
        // Filter by status
        if (selectedFilter === 'active') {
            filteredTasks = filteredTasks.filter(task => !task.completed);
        } else if (selectedFilter === 'completed') {
            filteredTasks = filteredTasks.filter(task => task.completed);
        }
        
        if (filteredTasks.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'No tasks found. Add a new task!';
            emptyMessage.style.textAlign = 'center';
            emptyMessage.style.padding = '20px';
            emptyMessage.style.color = '#999';
            taskList.appendChild(emptyMessage);
            return;
        }
        
        filteredTasks.forEach((task, index) => {
            const taskItem = document.createElement('li');
            taskItem.className = 'task-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'task-checkbox';
            checkbox.checked = task.completed;
            checkbox.addEventListener('change', () => toggleTaskComplete(index));
            
            const taskText = document.createElement('span');
            taskText.className = `task-text ${task.completed ? 'completed' : ''}`;
            taskText.textContent = task.text;
            
            const categoryBadge = document.createElement('span');
            categoryBadge.className = 'task-category';
            
            const categoryIcon = document.createElement('i');
            const category = categories.find(cat => cat.name === task.category);
            if (category) {
                categoryIcon.className = `fas fa-${category.icon}`;
                categoryBadge.appendChild(categoryIcon);
                
                const categoryName = document.createElement('span');
                categoryName.textContent = task.category.charAt(0).toUpperCase() + task.category.slice(1);
                categoryBadge.appendChild(categoryName);
            }
            
            const taskActions = document.createElement('div');
            taskActions.className = 'task-actions';
            
            const editBtn = document.createElement('button');
            editBtn.className = 'task-btn';
            editBtn.innerHTML = '<i class="fas fa-edit"></i>';
            editBtn.addEventListener('click', () => editTask(index));
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'task-btn';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.addEventListener('click', () => deleteTask(index));
            
            taskActions.appendChild(editBtn);
            taskActions.appendChild(deleteBtn);
            
            taskItem.appendChild(checkbox);
            taskItem.appendChild(taskText);
            taskItem.appendChild(categoryBadge);
            taskItem.appendChild(taskActions);
            
            taskList.appendChild(taskItem);
        });
    }

    // Add a new task
    function addTask() {
        const text = taskInput.value.trim();
        if (text === '') return;
        
        const newTask = {
            text,
            completed: false,
            category: selectedCategory === 'all' ? 'personal' : selectedCategory
        };
        
        tasks.push(newTask);
        saveTasks();
        taskInput.value = '';
        renderTasks();
        updateStats();
    }

    // Toggle task completion status
    function toggleTaskComplete(index) {
        tasks[index].completed = !tasks[index].completed;
        saveTasks();
        renderTasks();
        updateStats();
    }

    // Edit a task
    function editTask(index) {
        const newText = prompt('Edit your task:', tasks[index].text);
        if (newText !== null && newText.trim() !== '') {
            tasks[index].text = newText.trim();
            saveTasks();
            renderTasks();
        }
    }

    // Delete a task
    function deleteTask(index) {
        if (confirm('Are you sure you want to delete this task?')) {
            tasks.splice(index, 1);
            saveTasks();
            renderTasks();
            updateStats();
        }
    }

    // Clear completed tasks
    function clearCompletedTasks() {
        tasks = tasks.filter(task => !task.completed);
        saveTasks();
        renderTasks();
        updateStats();
    }

    // Save tasks to localStorage
    function saveTasks() {
        localStorage.setItem('tasks', JSON.stringify(tasks));
    }

    // Save categories to localStorage
    function saveCategories() {
        localStorage.setItem('categories', JSON.stringify(categories));
    }

    // Update statistics
    function updateStats() {
        totalTasksSpan.textContent = tasks.length;
        const completedCount = tasks.filter(task => task.completed).length;
        completedTasksSpan.textContent = completedCount;
    }

    // Add a new category
    function addCategory() {
        const name = newCategoryInput.value.trim().toLowerCase();
        if (name === '') return;
        
        // Check if category already exists
        if (categories.some(cat => cat.name === name)) {
            alert('Category already exists!');
            return;
        }
        
        const newCategory = {
            name,
            icon: selectedIcon
        };
        
        categories.push(newCategory);
        saveCategories();
        renderCategories();
        newCategoryInput.value = '';
        categoryModal.style.display = 'none';
    }

    // Event Listeners
    addTaskBtn.addEventListener('click', addTask);
    
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });
    
    addCategoryBtn.addEventListener('click', () => {
        categoryModal.style.display = 'flex';
    });
    
    closeModal.addEventListener('click', () => {
        categoryModal.style.display = 'none';
    });
    
    saveCategoryBtn.addEventListener('click', addCategory);
    
    iconOptions.forEach(icon => {
        icon.addEventListener('click', () => {
            iconOptions.forEach(i => i.classList.remove('selected'));
            icon.classList.add('selected');
            selectedIcon = icon.dataset.icon;
        });
    });
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedFilter = btn.dataset.filter;
            renderTasks();
        });
    });
    
    clearCompletedBtn.addEventListener('click', clearCompletedTasks);
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === categoryModal) {
            categoryModal.style.display = 'none';
        }
    });

    // Initialize the app
    init();
});