# Rayo ⚡ - Red Social en Tiempo Real

Una red social moderna estilo Twitter construida con JavaScript vanilla y Firebase, con mensajería y posts en tiempo real.

![Rayo Preview](https://api.dicebear.com/7.x/shapes/svg?seed=rayo&backgroundColor=1DA1F2)

## 🚀 Demo en Vivo

**👉 [https://rayo-7hyg.vercel.app](https://rayo-7hyg.vercel.app)**

## ✨ Características

### Autenticación
- 🔐 Login con Google (OAuth 2.0)
- 📧 Registro con Email/Contraseña
- 🔒 Autenticación segura con Firebase Auth

### Posts & Feed
- ✍️ Crear publicaciones con texto e imágenes
- ❤️ Likes sincronizados en tiempo real
- 💬 Comentarios compartidos entre usuarios
- 🗑️ Eliminar publicaciones propias
- 🔄 Actualización automática sin refresh

### Mensajería
- 💬 Mensajes directos en tiempo real
- 👥 Conversaciones privadas
- 🔔 Indicadores de mensajes no leídos
- 📱 Interfaz tipo WhatsApp/Instagram DMs

### UX/UI
- 🎨 Diseño moderno inspirado en Twitter/X
- 📱 Responsive para móvil y desktop
- 🌙 Interfaz elegante con animaciones suaves
- ⚡ Carga rápida y rendimiento optimizado

## 🛠️ Tecnologías

| Categoría | Tecnología |
|-----------|------------|
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) |
| **Backend** | Firebase (Serverless) |
| **Base de Datos** | Cloud Firestore (NoSQL, Real-time) |
| **Autenticación** | Firebase Auth (Google OAuth) |
| **Hosting** | Vercel (CI/CD automático) |
| **Control de Versiones** | Git + GitHub |

## 📁 Estructura del Proyecto

```
rayo/
├── index.html          # Página principal (Feed)
├── login.html          # Autenticación
├── messages.html       # Mensajería directa
├── app.js              # Lógica del feed y posts
├── messages.js         # Lógica de mensajes real-time
├── firebase-config.js  # Configuración de Firebase
├── firestore-service.js # Servicios de Firestore
├── style.css           # Estilos principales
└── messages.css        # Estilos de mensajería
```

## 🏗️ Arquitectura

```
┌─────────────────┐     ┌─────────────────┐
│   Frontend      │     │   Firebase      │
│   (Vanilla JS)  │◄───►│   (Backend)     │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │   WebSocket-like      │
         │   (onSnapshot)        │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│   Vercel        │     │   Firestore     │
│   (Hosting)     │     │   (Database)    │
└─────────────────┘     └─────────────────┘
```

## 🚀 Instalación Local

1. Clona el repositorio:
```bash
git clone https://github.com/vicenzoscavino1999/rayo.git
cd rayo
```

2. Abre con un servidor local:
```bash
# Con Python
python -m http.server 8000

# O con Node.js
npx serve
```

3. Abre `http://localhost:8000` en tu navegador

## 📝 Variables de Entorno

El proyecto usa Firebase. Para tu propia instancia, actualiza `firebase-config.js`:

```javascript
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  // ...
};
```

## 🎯 Características Técnicas Destacadas

- **Real-time Sync**: Uso de `onSnapshot` de Firestore para actualizaciones instantáneas
- **Optimistic UI**: Updates visuales inmediatos antes de confirmación del servidor
- **Fallback Graceful**: LocalStorage como backup si Firestore no está disponible
- **Event Delegation**: Manejo eficiente de eventos para mejor performance
- **Modular Code**: Separación clara de responsabilidades entre archivos

## 👨‍💻 Autor

**Vicenzo Scavino**

- GitHub: [@vicenzoscavino1999](https://github.com/vicenzoscavino1999)
- LinkedIn: [Tu LinkedIn aquí]

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.

---

⚡ Hecho con pasión en 2024
