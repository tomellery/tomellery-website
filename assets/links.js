// ============================================================
//  Tom's links: the ONE place to edit them.
//  Every design reads from this list, so a change here shows up everywhere.
//  To add a link: copy one { ... } block, change the details, and give it an icon below.
// ============================================================
window.TE = {
  name: "Tom Ellery",
  bio: "SLC 📍 Build · Ride · Repeat",
  links: [
    { id: "instagram", name: "Instagram", handle: "@tom.a.ellery",     url: "https://www.instagram.com/tom.a.ellery" },
    { id: "facebook",  name: "Facebook",  handle: "/tom.a.ellery",      url: "https://www.facebook.com/tom.a.ellery" },
    { id: "x",         name: "X",         handle: "@tomaellery",        url: "https://x.com/tomaellery" },
    { id: "linkedin",  name: "LinkedIn",  handle: "/in/thomas-ellery",  url: "https://www.linkedin.com/in/thomas-ellery" },
    { id: "venmo",     name: "Venmo",     handle: "@tomellery",         url: "https://venmo.com/u/tomellery" },
  ],
  icons: {
    instagram: "M12 2.2c3.2 0 3.6 0 4.8.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1.1.4 2.2.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1.1.4-2.2.4-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1.1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1.1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.4-.5.2-.9.4-1.3.8-.4.4-.6.8-.8 1.3-.2.4-.3 1-.4 2.1C2.6 9.9 2.6 10.3 2.6 12s0 2.1.1 3.3c.1 1.1.2 1.7.4 2.1.2.5.4.9.8 1.3.4.4.8.6 1.3.8.4.2 1 .3 2.1.4 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.4.5-.2.9-.4 1.3-.8.4-.4.6-.8.8-1.3.2-.4.3-1 .4-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c-.1-1.1-.2-1.7-.4-2.1-.2-.5-.4-.9-.8-1.3-.4-.4-.8-.6-1.3-.8-.4-.2-1-.3-2.1-.4C15.5 4 15.1 4 12 4zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8zm0 8.1a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zm6.2-8.3a1.1 1.1 0 1 1-2.3 0 1.1 1.1 0 0 1 2.3 0z",
    facebook: "M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z",
    x: "M18.9 1.2h3.7l-8 9.2L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9zm-1.3 19.4h2L6.5 3.3H4.3l13.3 17.3z",
    linkedin: "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z",
    venmo: "M20.4 1.5c.8 1.3 1.1 2.6 1.1 4.3 0 5.4-4.6 12.3-8.3 17.2H4.7L1.5 3.3l7.4-.7 1.8 14.3c1.7-2.7 3.7-7 3.7-10 0-1.6-.3-2.7-.7-3.6l6.7-1.8z",
  },

  // The icon for a link, as an <svg> tag
  icon(id) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${this.icons[id] || ""}"/></svg>`;
  },

  // Fill a list on the page: TE.render("#links", (link, i) => `<li>...</li>`)
  render(selector, template) {
    const el = document.querySelector(selector);
    if (el) el.innerHTML = this.links.map(template).join("");
  },
};
