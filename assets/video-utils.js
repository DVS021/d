(() => {
  'use strict';
  function validLocalVideoPath(value) {
    try {
      if (typeof value !== 'string' || !value.startsWith('media/videos/')) return false;
      const name = decodeURIComponent(value.slice('media/videos/'.length));
      return !!name && !name.startsWith('.') && !/[/\\\x00-\x1f\x7f]/.test(name)
        && /\.(mp4|webm|ogv)$/i.test(name) && value === 'media/videos/' + encodeURIComponent(name);
    } catch { return false; }
  }
  const driveIdPattern = /^[A-Za-z0-9_-]{20,200}$/;
  const resourceKeyPattern = /^[A-Za-z0-9_-]{1,200}$/;
  function parseDriveLink(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.port || url.username || url.password) return null;
      const path = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview))?\/?$/);
      const driveId = path ? path[1] : /^\/(open|uc)$/.test(url.pathname) ? url.searchParams.get('id') : null;
      const resourceKey = url.searchParams.get('resourcekey') || undefined;
      if (!driveIdPattern.test(driveId || '') || (resourceKey && !resourceKeyPattern.test(resourceKey))) return null;
      return { driveId, ...(resourceKey ? { resourceKey } : {}) };
    } catch { return null; }
  }
  function driveURL(video, mode = 'preview') {
    if (!driveIdPattern.test(video.driveId || '') || !['preview', 'view'].includes(mode)) return '';
    const url = new URL(`https://drive.google.com/file/d/${video.driveId}/${mode}`);
    if (video.resourceKey && resourceKeyPattern.test(video.resourceKey)) url.searchParams.set('resourcekey', video.resourceKey);
    return url.href;
  }
  function validVideo(video) {
    return !!video && typeof video.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(video.id)
      && typeof video.title === 'string' && video.title.trim().length > 0
      && typeof video.description === 'string'
      && ((video.provider === 'google-drive' && driveIdPattern.test(video.driveId || '')
          && (!video.resourceKey || resourceKeyPattern.test(video.resourceKey)))
        || ((!video.provider || video.provider === 'file') && validLocalVideoPath(video.src)))
      && (!video.poster || /^media\/videos\/[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp)$/.test(video.poster))
      && (!video.captions || /^media\/videos\/[a-z0-9][a-z0-9._-]*\.vtt$/.test(video.captions))
      && (!video.category || typeof video.category === 'string')
      && (!video.takeaways || (Array.isArray(video.takeaways) && video.takeaways.every(t => typeof t === 'string')))
      && Array.isArray(video.standards) && video.standards.every(n => Number.isInteger(n) && n >= 1 && n <= 18);
  }
  function durationLabel(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const total = Math.round(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }
  window.PORTAL_VIDEO_UTILS = { validVideo, durationLabel, parseDriveLink, driveURL };
})();
