class DokiComment extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }
        .comment-container {
          border: 1px solid #eaeaea;
          border-radius: 8px;
          padding: 20px;
          background-color: #fff;
        }
        .comment-header {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 20px;
          color: #333;
        }
        .comment-form {
          margin-bottom: 30px;
        }
        .comment-input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          resize: vertical;
          min-height: 100px;
          font-size: 14px;
        }
        .comment-submit {
          margin-top: 10px;
          padding: 8px 16px;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        .comment-submit:hover {
          background-color: #45a049;
        }
        .comment-list {
          margin-top: 30px;
        }
        .comment-item {
          padding: 15px;
          border-bottom: 1px solid #f0f0f0;
        }
        .comment-item:last-child {
          border-bottom: none;
        }
        .comment-content {
          margin-bottom: 10px;
          line-height: 1.5;
        }
        .comment-meta {
          font-size: 12px;
          color: #999;
          margin-bottom: 10px;
        }
        .comment-actions {
          display: flex;
          gap: 15px;
        }
        .comment-action {
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          font-size: 12px;
        }
        .comment-action:hover {
          color: #333;
        }
        .reply-form {
          margin-top: 15px;
          padding: 15px;
          background-color: #f9f9f9;
          border-radius: 4px;
        }
        .reply-input {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          resize: vertical;
          min-height: 60px;
          font-size: 14px;
        }
        .reply-submit {
          margin-top: 8px;
          padding: 6px 12px;
          background-color: #2196F3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }
        .reply-submit:hover {
          background-color: #0b7dda;
        }
        .replies {
          margin-top: 15px;
          margin-left: 20px;
        }
        .reply-item {
          padding: 10px;
          border-left: 3px solid #eaeaea;
          margin-bottom: 10px;
        }
        .reply-content {
          margin-bottom: 8px;
          line-height: 1.4;
        }
        .reply-meta {
          font-size: 11px;
          color: #999;
        }
      </style>
      <div class="comment-container">
        <div class="comment-header">评论区</div>
        <div class="comment-form">
          <textarea class="comment-input" placeholder="写下你的评论..."></textarea>
          <button class="comment-submit">发布评论</button>
        </div>
        <div class="comment-list">
          <!-- 评论列表将动态生成 -->
        </div>
      </div>
    `;
    }

    connectedCallback() {
        this.initEventListeners();
        this.loadComments();
    }

    initEventListeners() {
        const submitBtn = this.shadowRoot.querySelector(".comment-submit");
        submitBtn.addEventListener("click", () => this.handleSubmit());
    }

    handleSubmit() {
        const input = this.shadowRoot.querySelector(".comment-input");
        const content = input.value.trim();
        if (content) {
            this.addComment(content);
            input.value = "";
        }
    }

    addComment(content) {
        const comments = this.loadComments();
        const newComment = {
            id: Date.now().toString(),
            content: content,
            timestamp: new Date().toISOString(),
            likes: 0,
            replies: [],
        };
        comments.push(newComment);
        this.saveComments(comments);
        this.renderComments();
    }

    loadComments() {
        const stored = localStorage.getItem("doki-comments");
        return stored ? JSON.parse(stored) : [];
    }

    saveComments(comments) {
        localStorage.setItem("doki-comments", JSON.stringify(comments));
    }

    renderComments() {
        const commentList = this.shadowRoot.querySelector(".comment-list");
        const comments = this.loadComments();

        if (comments.length === 0) {
            commentList.innerHTML =
                '<p style="text-align: center; color: #999;">暂无评论，快来发表第一条评论吧！</p>';
            return;
        }

        commentList.innerHTML = comments
            .map(
                (comment) => `
      <div class="comment-item" data-id="${comment.id}">
        <div class="comment-content">${comment.content}</div>
        <div class="comment-meta">${this.formatDate(comment.timestamp)}</div>
        <div class="comment-actions">
          <button class="comment-action reply-btn">回复</button>
          <button class="comment-action like-btn">点赞 (${comment.likes})</button>
        </div>
        ${
            comment.replies.length > 0
                ? `
          <div class="replies">
            ${comment.replies
                .map(
                    (reply) => `
              <div class="reply-item">
                <div class="reply-content">${reply.content}</div>
                <div class="reply-meta">${this.formatDate(reply.timestamp)}</div>
              </div>
            `,
                )
                .join("")}
          </div>
        `
                : ""
        }
      </div>
    `,
            )
            .join("");

        // 添加事件监听器
        this.addCommentEventListeners();
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    addCommentEventListeners() {
        // 回复按钮事件
        const replyBtns = this.shadowRoot.querySelectorAll(".reply-btn");
        replyBtns.forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const commentItem = e.target.closest(".comment-item");
                this.showReplyForm(commentItem);
            });
        });

        // 点赞按钮事件
        const likeBtns = this.shadowRoot.querySelectorAll(".like-btn");
        likeBtns.forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const commentItem = e.target.closest(".comment-item");
                const commentId = commentItem.dataset.id;
                this.handleLike(commentId);
            });
        });
    }

    showReplyForm(commentItem) {
        // 检查是否已经有回复表单
        if (commentItem.querySelector(".reply-form")) {
            return;
        }

        const replyForm = document.createElement("div");
        replyForm.className = "reply-form";
        replyForm.innerHTML = `
      <textarea class="reply-input" placeholder="写下你的回复..."></textarea>
      <button class="reply-submit">提交回复</button>
    `;

        commentItem.appendChild(replyForm);

        // 添加回复提交事件
        const submitBtn = replyForm.querySelector(".reply-submit");
        submitBtn.addEventListener("click", () => {
            const input = replyForm.querySelector(".reply-input");
            const content = input.value.trim();
            if (content) {
                const commentId = commentItem.dataset.id;
                this.addReply(commentId, content);
                replyForm.remove();
            }
        });
    }

    addReply(commentId, content) {
        const comments = this.loadComments();
        const comment = comments.find((c) => c.id === commentId);
        if (comment) {
            const newReply = {
                id: Date.now().toString(),
                content: content,
                timestamp: new Date().toISOString(),
            };
            comment.replies.push(newReply);
            this.saveComments(comments);
            this.renderComments();
        }
    }

    handleLike(commentId) {
        const comments = this.loadComments();
        const comment = comments.find((c) => c.id === commentId);
        if (comment) {
            comment.likes += 1;
            this.saveComments(comments);
            this.renderComments();
        }
    }
}

customElements.define("doki-comment", DokiComment);
