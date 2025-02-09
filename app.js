// Variables to keep track of page loading and user information
let currentPage = 1;
let nextPageUrl = null;
let isLoading = false;
let accountId = null;
// Store replies that we find before their parent posts:
// this could happen when the reply of a post is on a given page
// but the main post is on the next one.
let orphanedReplies = new Map();

// Shows a loading spinner when content is being fetched
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

// Finds a user's account ID based on their username:
// the account ID is used to get everything from the API.
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

// Extracts navigation links from the response headers:
// this is used for pagination (loading more posts)
function getLinkFromHeader(linkHeader, rel) {
  if (!linkHeader) return null;

  const links = linkHeader.split(',');
  const requestedLink = links.find((link) => link.includes(`rel="${rel}"`));

  if (!requestedLink) return null;

  return requestedLink.match(/<(.+)>/)[1];
}

// Takes a post and formats its content for display
// If isReply is true, it will be styled as a reply to another post
function renderPostContent(post, isReply = false) {
  // Create a temporary container to work with the HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = post.content;

  // If markdown is enabled, convert the content to proper markdown
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

  // Remove the blog hashtag from the content since we don't want to display it
  tempDiv.querySelectorAll('a').forEach((link) => {
    if (link.textContent.toLowerCase() === `#${blogHashtag}`) {
      link.remove();
    } else {
      link.target = '_blank';
      link.classList.add('post-link');
    }
  });

  // Build the HTML structure for the post
  let content = `
    ${isReply ? '<div class="post-reply">' : ''}
    ${tempDiv.innerHTML}
  `;

  // Add any images that were attached to the post
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

  // Add replies from the post owner inline with the post
  if (post.replies && post.replies.length > 0) {
    const ownerReplies = post.replies.filter((reply) => reply.account.id === accountId);
    ownerReplies.forEach((reply) => {
      content += renderPostContent(reply, true);
    });
  }

  content += isReply ? '</div>' : '';
  return content;
}

// Fetches all replies to a specific post: those will be treated as comments
async function fetchRepliesComments(statusId) {
  try {
    const response = await fetch(`https://${server}/api/v1/statuses/${statusId}/context`);
    const data = await response.json();
    // We only want replies that come after our post
    const replies = data.descendants || [];
    // Only replies that are not our own
    return replies.filter((reply) => reply.account.id !== accountId);
  } catch (error) {
    console.error('Error fetching replies', error);
    return [];
  }
}

// Takes an array of posts and displays them on the page
async function displayPosts(posts) {
  const postsContainer = document.getElementById('posts');

  // Clear the container if this is the first page
  if (currentPage === 1) {
    postsContainer.innerHTML = '';
  }

  // Create a map to organize posts and their replies
  const postsMap = new Map();
  posts.forEach((post) => {
    // Don't include reposted content (reblog)
    if (!post.reblog) {
      postsMap.set(post.id, {
        ...post,
        replies: [],
      });
    }
  });

  // We may have some replies from previous pages:
  // check if we can attach any orphaned replies to the new posts
  postsMap.forEach((post) => {
    const orphanedChildren = orphanedReplies.get(post.id);
    if (orphanedChildren) {
      post.replies = [...orphanedChildren, ...(post.replies || [])];
      orphanedReplies.delete(post.id);
    }
  });

  // Organize posts into conversations (original posts and their replies)
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
      } else if (post.account.id === accountId) {
        // Store this reply as orphaned if we can't find its parent
        const orphanedSiblings = orphanedReplies.get(post.in_reply_to_id) || [];
        orphanedReplies.set(post.in_reply_to_id, [...orphanedSiblings, postWithReplies]);
      }
    } else {
      // If it's a root post (not a reply), check for specified blogHashtag
      const hasBlogTag = post.tags.some((tag) => tag.name.toLowerCase() === blogHashtag);
      if (hasBlogTag || !blogHashtag) {
        conversations.push(postWithReplies);
      }
    }
  });

  // Display each conversation on the page
  for (const conversation of conversations) {
    // Create an article element for the post
    const postElement = document.createElement('article');
    postElement.className = 'post';

    // Format the date for display
    const date = new Date(conversation.created_at);
    const formattedDate = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Build the HTML for the post
    let postHtml = `
      <div class="post-date"><a href="${conversation.url}" class="post-link" target="_blank">${formattedDate}</a></div>
      <div class="post-content">${renderPostContent(conversation)}</div>
    `;

    // If comments are enabled, fetch and display them
    if (withComments) {
      const replies = await fetchRepliesComments(conversation.id);

      if (replies.length > 0) {
        postHtml += `<div class="post-comments">
          <h3>Comments (${replies.length})</h3>
          ${replies.map((reply) => `
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

// Updates the pagination controls (for loading more posts)
function updatePaginationControls() {
  const existingPagination = document.querySelector('.pagination');
  if (existingPagination) {
    existingPagination.remove();
  }
}

// Fetches posts from the server
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

// Checks if user has scrolled near the bottom of the page:
// if so, loads more posts automatically
function handleScroll() {
  if (!nextPageUrl || isLoading) return;

  const scrollPosition = window.innerHeight + window.scrollY;
  const bodyHeight = document.documentElement.scrollHeight;

  // Load more when user is near the bottom (100px threshold)
  if (bodyHeight - scrollPosition < 100) {
    fetchPosts(nextPageUrl);
  }
}

// Updates the profile section at the top of the page
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

// Fetches the user's profile information
async function fetchProfile() {
  try {
    const response = await fetch(`https://${server}/api/v1/accounts/${accountId}`);
    const profile = await response.json();
    updateHeroText(profile);
  } catch (error) {
    console.error('Error fetching profile', error);
  }
}

// Hides certain elements using CSS:
// it is a bit hacky but it allows to customize a bit if needed
function applyPostCss() {
  const style = document.createElement('style');
  style.textContent = `a[href="https://${server}/@${username}"] { display: none; }`;
  document.head.appendChild(style);
}

// When the page loads, start everything up
document.addEventListener('DOMContentLoaded', async () => {
  // Look up the user's account ID
  accountId = await lookupAccount(username);
  if (!accountId) {
    document.getElementById('posts').innerHTML = '<p>Error: Could not find the specified account.</p>';
    return;
  }

  // Load the profile and first page of posts
  fetchProfile();
  fetchPosts();
  applyPostCss();

  // Set up infinite scrolling
  window.addEventListener('scroll', handleScroll);
});
