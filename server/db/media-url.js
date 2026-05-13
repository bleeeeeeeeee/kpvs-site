const MEDIA_PUBLIC_BASE = String(process.env.PUBLIC_URL || process.env.MEDIA_CDN_BASE || "").replace(/\/$/, "");
function publicMediaUrl(url) {
  if (url == null) return url;
  const u = String(url).trim();
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (!MEDIA_PUBLIC_BASE) return u.startsWith("/") ? u : "/" + u;
  return MEDIA_PUBLIC_BASE + (u.startsWith("/") ? u : "/" + u);
}
function mapProductRowMedia(row) {
  if (!row || typeof row !== "object") return row;
  if (row.image != null && String(row.image).trim() !== "") row.image = publicMediaUrl(row.image);
  if (row.brand_logo != null && String(row.brand_logo).trim() !== "") row.brand_logo = publicMediaUrl(row.brand_logo);
  if (row.collections != null && typeof row.collections === "string") {
    try {
      const parsed = JSON.parse(row.collections);
      row.collections = Array.isArray(parsed) ? parsed : [];
    } catch {
      row.collections = [];
    }
  }
  if (Array.isArray(row.images)) {
    row.images = row.images.map((img) => {
      if (!img || typeof img !== "object") return img;
      const copy = { ...img };
      if (copy.url != null && String(copy.url).trim() !== "") copy.url = publicMediaUrl(copy.url);
      return copy;
    });
  }
  return row;
}
function mapBrandRowMedia(row) {
  if (!row || typeof row !== "object") return row;
  if (row.logo_url != null && String(row.logo_url).trim() !== "") row.logo_url = publicMediaUrl(row.logo_url);
  return row;
}
module.exports = {
  publicMediaUrl,
  mapProductRowMedia,
  mapBrandRowMedia
};
