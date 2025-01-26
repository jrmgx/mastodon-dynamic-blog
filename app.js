let currentPage = 1;
let nextPageUrl = null;
let isLoading = false;
let accountId = null;

function showLoader() {
  const loader = document.querySelector('.loader') || document.createElement('div');
  loader.className = 'loader';
  loader.innerHTML = 'Loading...';
  document.getElementById('posts').insertAdjacentElement('afterend', loader);
}

function hideLoader() {
  const loader = document.querySelector('.loader');
  if (loader) {
    loader.remove();
  }
}

async function lookupAccount(username) {
  try {
    const response = await fetch(`https://${server}/api/v1/accounts/lookup?acct=${username}`);
    const data = await response.json();
    return data.id;
  } catch (error) {
    console.error('Error looking up account', error);
    return null;
  }
}

function getLinkFromHeader(linkHeader, rel) {
  if (!linkHeader) return null;

  const links = linkHeader.split(',');
  const requestedLink = links.find((link) => link.includes(`rel="${rel}"`));

  if (!requestedLink) return null;

  return requestedLink.match(/<(.+)>/)[1];
}

// Recursively render post content with replies
function renderPostContent(post, isReply = false) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = post.content;
  if (withMarkdown) {
    tempDiv.normalize();
    // Remove links where the text is an URL, but keep the text.
    // This is to allow the markdown link syntax to work.
    tempDiv.querySelectorAll('a').forEach(link => {
      const isUrlText = /^(https?:\/\/|www\.)/.test(link.textContent);
      if (isUrlText) {
        link.replaceWith(link.textContent);
      }
    });

    // Remove paragraphs and break lines
    const markdown = tempDiv.innerHTML
      // Convert <p> tags to double newlines
      .replace(/<p[^>]*>(.*?)<\/p>/g, '$1\n\n')
      // Convert <br> tags to newlines
      .replace(/<br\s*\/?>/g, '\n')
      .trim();

    tempDiv.innerHTML = markdownit({ html: true, linkify: true }).render(markdown);
  }

  // Remove `blogHashtag` hashtag
  tempDiv.querySelectorAll('a').forEach((link) => {
    if (link.textContent.toLowerCase() === `#${blogHashtag}`) {
      link.remove();
    } else {
      link.target = '_blank';
      link.classList.add('post-link');
    }
  });

  let content = `
    ${isReply ? '<div class="post-reply">' : ''}
    ${tempDiv.innerHTML}
  `;

  // Add media attachments
  if (post.media_attachments && post.media_attachments.length > 0) {
    content += post.media_attachments
      .map((media) => {
        if (media.type === 'image') {
          return `<img src="${media.url}" alt="${media.description || ''}" class="post-media">`;
        }
        return '';
      })
      .join('');
  }

  // Only add owner replies inline
  if (post.replies && post.replies.length > 0) {
    const ownerReplies = post.replies.filter((reply) => reply.account.id === accountId);
    ownerReplies.forEach((reply) => {
      content += renderPostContent(reply, true);
    });
  }

  content += isReply ? '</div>' : '';
  return content;
}

async function fetchReplies(statusId) {
  try {
    const response = await fetch(`https://${server}/api/v1/statuses/${statusId}/context`);
    const data = await response.json();
    // We only want replies that come after our post
    return data.descendants || [];
  } catch (error) {
    console.error('Error fetching replies', error);
    return [];
  }
}

async function displayPosts(posts) {
  const postsContainer = document.getElementById('posts');

  if (currentPage === 1) {
    postsContainer.innerHTML = '';
  }

  // First, build a map of all posts
  const postsMap = new Map();
  posts.forEach((post) => {
    if (!post.reblog) {
      postsMap.set(post.id, {
        ...post,
        replies: [],
      });
    }
  });

  // Build conversation trees
  const conversations = [];
  posts.forEach((post) => {
    if (post.reblog) return;

    const postWithReplies = postsMap.get(post.id);

    // If this is a reply to another post
    if (post.in_reply_to_id) {
      const parentPost = postsMap.get(post.in_reply_to_id);
      if (parentPost && post.account.id === accountId) {
        if (!parentPost.replies) parentPost.replies = [];
        parentPost.replies.push(postWithReplies);
      }
    } else {
      // If it's a root post (not a reply), check for specified blogHashtag
      const hasBlogTag = post.tags.some((tag) => tag.name.toLowerCase() === blogHashtag);
      if (hasBlogTag || !blogHashtag) {
        conversations.push(postWithReplies);
      }
    }
  });

  // Render each conversation
  for (const conversation of conversations) {
    const postElement = document.createElement('article');
    postElement.className = 'post';

    const date = new Date(conversation.created_at);
    const formattedDate = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Render the main post content
    let postHtml = `
      <div class="post-date"><a href="${conversation.url}" class="post-link" target="_blank">${formattedDate}</a></div>
      <div class="post-content">${renderPostContent(conversation)}</div>
    `;

    // Fetch and add replies
    const replies = withComments ? await fetchReplies(conversation.id) : [];
    const nonOwnerReplies = replies.filter((reply) => reply.account.id !== accountId);

    if (nonOwnerReplies.length > 0) {
      postHtml += `<div class="post-comments">
        <h3>Comments (${nonOwnerReplies.length})</h3>
        ${nonOwnerReplies.map((reply) => `
          <div class="post-comment">
            <div class="comment-author">
              <img src="${reply.account.avatar}" alt="${reply.account.display_name}" class="comment-avatar">
              <strong>${reply.account.display_name}</strong>
            </div>
            <div class="comment-content">${reply.content}</div>
          </div>
      `).join('')}
      </div>`;
    }

    // Add comment button after comments
    if (withComments) {
      postHtml += `
        <div class="post-actions">
          <a href="${conversation.url}" class="post-link" target="_blank">💬 Comment on Mastodon</a>
        </div>
      `;
    }

    postElement.innerHTML = postHtml;
    postsContainer.appendChild(postElement);
  }

  currentPage++;
}

function updatePaginationControls() {
  const existingPagination = document.querySelector('.pagination');
  if (existingPagination) {
    existingPagination.remove();
  }
}

async function fetchPosts(url = null) {
  if (isLoading) return;
  if (!accountId) return;

  try {
    isLoading = true;
    showLoader();

    const fetchUrl = url || `https://${server}/api/v1/accounts/${accountId}/statuses`;
    const response = await fetch(fetchUrl);
    const posts = await response.json();

    const linkHeader = response.headers.get('Link');
    nextPageUrl = getLinkFromHeader(linkHeader, 'next');

    displayPosts(posts);
    updatePaginationControls();
  } catch (error) {
    console.error('Error fetching posts:', error);
    document.getElementById('posts').innerHTML = '<p>Error loading posts. Please try again later.</p>';
  } finally {
    isLoading = false;
    hideLoader();
  }
}

function handleScroll() {
  if (!nextPageUrl || isLoading) return;

  const scrollPosition = window.innerHeight + window.scrollY;
  const bodyHeight = document.documentElement.scrollHeight;

  // Load more when user is near the bottom (100px threshold)
  if (bodyHeight - scrollPosition < 100) {
    fetchPosts(nextPageUrl);
  }
}

function updateHeroText(profile) {
  const heroText = document.querySelector('.hero-text');
  if (heroText && profile.note) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = profile.note;

    tempDiv.querySelectorAll('a').forEach((link) => {
      link.target = '_blank';
      link.classList.add('post-link');
    });

    heroText.innerHTML = tempDiv.innerHTML;
  }

  // Update profile picture and favicon
  const profileImg = document.querySelector('.hero img');
  const favicon = document.querySelector('link[rel="icon"]');
  if (profileImg) {
    profileImg.src = profile.avatar || defaultAvatar;
    profileImg.alt = profile.display_name || 'Profile picture';
  }
  if (favicon) {
    favicon.href = profile.avatar || defaultAvatar;
  }
}

async function fetchProfile() {
  try {
    const response = await fetch(`https://${server}/api/v1/accounts/${accountId}`);
    const profile = await response.json();
    updateHeroText(profile);
  } catch (error) {
    console.error('Error fetching profile', error);
  }
}

function applyPostCss() {
  const style = document.createElement('style');
  style.textContent = `a[href="https://${server}/@${username}"] { display: none; }`;
  document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', async () => {
  accountId = await lookupAccount(username);
  if (!accountId) {
    document.getElementById('posts').innerHTML = '<p>Error: Could not find the specified account.</p>';
    return;
  }

  fetchProfile();
  fetchPosts();
  applyPostCss();

  window.addEventListener('scroll', handleScroll);
});
