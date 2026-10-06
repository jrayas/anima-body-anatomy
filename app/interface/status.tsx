// Small, unobtrusive streaming indicator and the error notice.
import {UI} from '../content';

export function StreamingStatus({progress}: {progress: number}) {
  if (progress >= 100) return null;
  return (
    <div className="streaming" role="status" aria-live="polite">
      <span>{UI.loading}</span><output>{progress}%</output>
      <i aria-hidden="true" style={{transform: `scaleX(${progress / 100})`}}/>
    </div>
  );
}

export function ErrorNotice({message}: {message: string}) {
  return (
    <div className="error-notice panel" role="alert">
      <p>{message}</p>
      <button className="ghost-button" onClick={() => location.reload()}>{UI.reload}</button>
    </div>
  );
}
