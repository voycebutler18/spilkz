import { createRoot } from 'react-dom/client'
import { HelmetProvider } from "react-helmet-async";
import App from './App.tsx'
import './index.css'

const root = createRoot(document.getElementById("root")!);
root.render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
