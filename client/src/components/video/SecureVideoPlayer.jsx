import React from 'react';
import YouTubePlayer from './YouTubePlayer.jsx';
import WidevinePlayer from './WidevinePlayer.jsx';
import ScreenCaptureGuard from './ScreenCaptureGuard.jsx';

/**
 * Unified Secure Video Player Dispatcher
 * Routes playback to either the existing YouTube player or the Widevine DRM player
 * based on the video's configured video_type.
 * Protected by ScreenCaptureGuard against screen capture, window blur, and screenshot shortcuts.
 */
export default function SecureVideoPlayer({
  video,
  playback,
  progress,
  onProgressUpdate,
  student,
  watermarkProfile,
  playerControlRef
}) {
  const isWidevine = video?.video_type === 'widevine' || playback?.provider === 'widevine';

  return (
    <ScreenCaptureGuard>
      {isWidevine ? (
        <WidevinePlayer
          manifestUrl={playback?.manifestUrl || video?.manifest_url}
          licenseServerUrl={playback?.licenseServerUrl}
          playbackToken={playback?.playbackToken}
          isConfigured={playback?.isConfigured !== false}
          unconfiguredMessage={playback?.unconfiguredMessage}
          duration={video?.duration_seconds}
          initialProgressSeconds={progress?.progress_seconds || 0}
          onProgressUpdate={onProgressUpdate}
          disclaimer={playback?.disclaimer}
          student={student}
          watermarkProfile={watermarkProfile}
          playerControlRef={playerControlRef}
        />
      ) : (
        <YouTubePlayer
          videoId={playback?.videoId || video?.external_video_id}
          duration={video?.duration_seconds}
          initialProgressSeconds={progress?.progress_seconds || 0}
          onProgressUpdate={onProgressUpdate}
          privacyType={playback?.privacyType}
          disclaimer={playback?.disclaimer}
          student={student}
          watermarkProfile={watermarkProfile}
          playerControlRef={playerControlRef}
        />
      )}
    </ScreenCaptureGuard>
  );
}
