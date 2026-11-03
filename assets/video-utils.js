(() => {
  'use strict';
  const videoPath = /^media\/videos\/[a-z0-9][a-z0-9._-]*\.(mp4|webm|ogv)$/;
  function validVideo(video) {
    return !!video && typeof video.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(video.id)
      && typeof video.title === 'string' && video.title.trim().length > 0
      && typeof video.description === 'string'
      && videoPath.test(video.src)
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
  window.PORTAL_VIDEO_UTILS = { validVideo, durationLabel };
})();
