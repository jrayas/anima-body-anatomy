import {createRoot} from 'react-dom/client';
import Home from '../app/page';
import {registerServiceWorker} from '../app/service-worker';
import '../app/globals.css';
registerServiceWorker();
createRoot(document.getElementById('root')!).render(<Home/>);
