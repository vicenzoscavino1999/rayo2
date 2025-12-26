document.addEventListener('DOMContentLoaded', () => {
    // 1. Tab Switching
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            // Here you would normally filter the feed
            console.log(`Cambiando a tab: ${tab.dataset.tab}`);
        });
    });

    // 2. Publish Button State
    const textarea = document.getElementById('post-textarea');
    const btnPost = document.getElementById('btn-post');

    textarea.addEventListener('input', () => {
        if (textarea.value.trim().length > 0) {
            btnPost.disabled = false;
        } else {
            btnPost.disabled = true;
        }

        // Auto-resize textarea
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    });

    // 3. Heart/Like Interaction
    const postsContainer = document.getElementById('posts-container');

    postsContainer.addEventListener('click', (e) => {
        const heartAction = e.target.closest('.action-heart');
        if (heartAction) {
            e.preventDefault();
            e.stopPropagation();

            const icon = heartAction.querySelector('i');
            const span = heartAction.querySelector('span');
            let count = parseInt(span.innerText);

            if (heartAction.classList.contains('active')) {
                heartAction.classList.remove('active');
                span.innerText = count - 1;
                icon.setAttribute('data-lucide', 'heart');
            } else {
                heartAction.classList.add('active');
                span.innerText = count + 1;
                // Note: Changing data-lucide needs re-render, but usually we just toggle CSS
            }
            // re-render icon if needed, but for MVP we just use CSS class for fill
        }
    });

    // 4. Mimic "Publishing" a post
    btnPost.addEventListener('click', () => {
        const content = textarea.value.trim();
        if (!content) return;

        const newPost = createPostElement(content);
        postsContainer.prepend(newPost);

        // Reset composer
        textarea.value = '';
        textarea.style.height = 'auto';
        btnPost.disabled = true;

        // Re-initialize icons for the new post
        lucide.createIcons();
    });

    function createPostElement(content) {
        const article = document.createElement('article');
        article.className = 'post';

        article.innerHTML = `
            <div class="post-layout">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" class="avatar-small">
                <div class="post-body">
                    <header class="post-header">
                        <span class="post-user-name">Usuario</span>
                        <span class="post-user-handle">@usuario_rayo</span>
                        <span class="post-time">· ahora</span>
                        <i data-lucide="more-horizontal" class="post-options"></i>
                    </header>
                    <div class="post-content">
                        ${content.replace(/\n/g, '<br>')}
                    </div>
                    <footer class="post-footer">
                        <div class="post-action"><i data-lucide="message-circle"></i> <span>0</span></div>
                        <div class="post-action action-repost"><i data-lucide="repeat"></i> <span>0</span></div>
                        <div class="post-action action-heart"><i data-lucide="heart"></i> <span>0</span></div>
                        <div class="post-action"><i data-lucide="bar-chart-2"></i> <span>0</span></div>
                        <div class="post-action"><i data-lucide="share"></i></div>
                    </footer>
                </div>
            </div>
        `;
        return article;
    }
});
