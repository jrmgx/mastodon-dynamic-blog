# Mastodon dynamic blog

This project will give you a blog-like website based on a Mastodon account.

It can be very handy, people can read you even if they don't have any interest in social networks or Mastodon.

The code is very simple, it is made to be loaded as fast as possible and also to be understandable by most people.

You can see an example here: [blog.viaodyssey.net](https://blog.viaodyssey.net)

## Installation

 - This is as easy as possible, you only have to fork this repository.
 - Edit the `index.html` to put the metadata you want (title for example)
 - Edit the `config.js` file to put your Mastodon information and choose options
 - Deploy on GitHub pages (for example)

[Here you have a video that recap the full process](https://video.gangneux.net/w/hspxYJWvqBsFQB2mNSe2Br)

### Fork the repository

On [GitHub](https://github.com/jrmgx/mastodon-dynamic-blog) find the green button on the top right saying 'Use this template' and select 'Create a new repository'.

From here you will have your own copy of the code, ready for the next step.

### Edit files

#### Index.html

In your own repository, you will have all the files listed.

Find `index.html` and click on it, from here use the 'pencil' button on the top right (edit) and click on it.
Now you are ready to update the metadata associated with your copy.

Read the file, it has comments so you can navigate it easily!

 - Mostly you want to update the title with something that's suits you
 - You also want to update the RSS link

#### Config.js

In your own repository, you will have all the files listed.

Find `config.js` and click on it, from here use the 'pencil' button on the top right (edit) and click on it.
Now you are ready to update the metadata associated with your copy.

Read the file, it has comments so you can navigate it easily!

 - Mostly you want to update the server (instance name) and your own username
 - Then you have a few options:
   - `blogHashtag` Only posts with this hashtag will be listed, by default every post are shown
   - `withComments` Show what people will reply as comment on the blog
   - `withMarkdown` Parse your content as Markdown so you can add formatting on your blog posts

#### Others changes

Of course, you are free to update any other parts and edit the CSS, the HTML, even the Javascript if you feel like it.

### Deploy

In this example I'll explain how to publish this on GitHub pages as it is free and quite easy.

 - On your repository/copy, click 'Settings' in the menu bar on the top
 - Find 'Pages' on the left sidebar
 - Under 'Branch' pick 'main' and click 'save'
 - Wait a bit, and reload this page: on top, GitHub will give you the URL where you can find your live website!

From here you can buy a domain name and with a bit of configuration you can associate it to this website.
This is out of the scope of this README, but you will find plenty of documentation and help on the Internet.
