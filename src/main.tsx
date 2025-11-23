import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Ensure each browser/user has a persistent client-generated user id
if (typeof window !== 'undefined' && !sessionStorage.getItem('clientUserId')) {
	try {
		const id = (crypto && crypto.randomUUID && crypto.randomUUID()) || `client-${Date.now()}`;
		sessionStorage.setItem('clientUserId', id);
	} catch (e) {
		sessionStorage.setItem('clientUserId', `client-${Date.now()}`);
	}
}

createRoot(document.getElementById("root")!).render(<App />);
