const url = import.meta.env.VITE_UMAMI_SCRIPT_URL;
const id = import.meta.env.VITE_UMAMI_WEBSITE_ID;

if (url && id) {
  const script = document.createElement("script");
  script.defer = true;
  script.src = url;
  script.dataset.websiteId = id;
  document.head.appendChild(script);
}
