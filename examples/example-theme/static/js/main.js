/**
 * 示例主题 JavaScript
 */

(function () {
    "use strict";

    /**
     * 初始化代码高亮
     */
    function initCodeHighlight() {
        document.querySelectorAll("pre code").forEach(function (block) {
            if (window.hljs) {
                window.hljs.highlightElement(block);
            }
        });
    }

    /**
     * 初始化图片懒加载
     */
    function initLazyLoad() {
        var images = document.querySelectorAll("img[data-src]");

        if ("IntersectionObserver" in window) {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        var img = entry.target;
                        img.src = img.dataset.src;
                        img.removeAttribute("data-src");
                        observer.unobserve(img);
                    }
                });
            });

            images.forEach(function (img) {
                observer.observe(img);
            });
        } else {
            images.forEach(function (img) {
                img.src = img.dataset.src;
            });
        }
    }

    /**
     * 移动端导航切换
     */
    function initMobileNav() {
        var navToggle = document.querySelector(".nav-toggle");
        var nav = document.querySelector(".site-nav");

        if (navToggle && nav) {
            navToggle.addEventListener("click", function () {
                nav.classList.toggle("active");
            });
        }
    }

    /**
     * 回到顶部
     */
    function initBackToTop() {
        var btn = document.querySelector(".back-to-top");

        if (btn) {
            window.addEventListener("scroll", function () {
                if (window.scrollY > 300) {
                    btn.classList.add("visible");
                } else {
                    btn.classList.remove("visible");
                }
            });

            btn.addEventListener("click", function () {
                window.scrollTo({
                    top: 0,
                    behavior: "smooth",
                });
            });
        }
    }

    /**
     * DOM 加载完成后初始化
     */
    document.addEventListener("DOMContentLoaded", function () {
        initCodeHighlight();
        initLazyLoad();
        initMobileNav();
        initBackToTop();
    });
})();
