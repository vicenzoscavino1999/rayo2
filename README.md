# Rayo ⚡ - Red Social en Tiempo Real

Una red social moderna estilo Twitter construida con JavaScript vanilla y Firebase, con mensajería y posts en tiempo real.

![Rayo Preview](https://api.dicebear.com/7.x/shapes/svg?seed=rayo&backgroundColor=1DA1F2)

## 🚀 Demo en Vivo

**👉 [https://rayo-zeta.vercel.app](https://rayo-zeta.vercel.app)**

## ✨ Características

### Autenticación
- 🔐 Login con Google (OAuth 2.0)
- 📧 Registro con Email/Contraseña
- 🔑 Recuperación de contraseña
- 🔒 Autenticación segura con Firebase Auth

### Posts & Feed
- ✍️ Crear publicaciones con texto e imágenes
- 📷 Subida de imágenes con Cloudinary
- ❤️ Likes sincronizados en tiempo real
- 💬 Comentarios compartidos entre usuarios
- 🗑️ Eliminar publicaciones propias
- 🔄 Actualización automática sin refresh

### Perfiles de Usuario
- 👤 Perfiles personalizables
- 📸 Foto de perfil con upload a Cloudinary
- ✏️ Editar nombre, usuario y biografía
- 👥 Sistema de seguidores/siguiendo
- ✓ Verificación de cuentas

### Mensajería
- 💬 Mensajes directos en tiempo real
- 👥 Conversaciones privadas
- 🔔 Indicadores de mensajes no leídos
- 📱 Interfaz tipo WhatsApp/Instagram DMs

### UX/UI
- 🎨 Diseño moderno inspirado en Twitter/X
- 📱 **Diseño responsive para móvil y desktop**
- 📲 Navegación inferior para móvil
- 🌙 Interfaz elegante con animaciones suaves
- ⚡ Carga rápida y rendimiento optimizado

### Legal & Soporte
- 📜 Términos de Servicio
- 🔐 Política de Privacidad

## 🛠️ Tecnologías

| Categoría | Tecnología |
|-----------|------------|
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) |
| **Build Tool** | Vite |
| **Backend** | Firebase (Serverless) |
| **Base de Datos** | Cloud Firestore (NoSQL, Real-time) |
| **Autenticación** | Firebase Auth (Google OAuth) |
| **Imágenes** | Cloudinary |
| **Hosting** | Vercel (CI/CD automático) |
| **Control de Versiones** | Git + GitHub |

## 📁 Estructura del Proyecto

```
rayo/
├── index.html          # Página principal (Feed)
├── login.html          # Autenticación
├── messages.html       # Mensajería directa
├── terms.html          # Términos de Servicio
├── privacy.html        # Política de Privacidad
├── app.js              # Lógica del feed y posts
├── messages.js         # Lógica de mensajes real-time
├── firebase-config.js  # Configuración de Firebase
├── utils.js            # Utilidades compartidas
├── style.css           # Estilos principales
├── messages.css        # Estilos de mensajería
├── vite.config.js      # Configuración de Vite
└── package.json        # Dependencias npm
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
         │
         ▼
┌─────────────────┐
│   Cloudinary    │
│   (Imágenes)    │
└─────────────────┘
```

## 🚀 Instalación Local

1. Clona el repositorio:
```bash
git clone https://github.com/vicenzoscavino1999/rayo2.git
cd rayo2
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura las variables de entorno (crea `.env`):
```env
VITE_FIREBASE_API_KEY=tu_api_key
VITE_FIREBASE_AUTH_DOMAIN=tu_auth_domain
VITE_FIREBASE_PROJECT_ID=tu_project_id
VITE_FIREBASE_STORAGE_BUCKET=tu_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
VITE_FIREBASE_APP_ID=tu_app_id
VITE_CLOUDINARY_CLOUD_NAME=tu_cloud_name
VITE_CLOUDINARY_UPLOAD_PRESET=tu_upload_preset
```

4. Inicia el servidor de desarrollo:
```bash
npm run dev
```

5. Abre `http://localhost:3000` en tu navegador

## 🔧 Scripts Disponibles

```bash
npm run dev    # Servidor de desarrollo
npm run build  # Build para producción
npm run preview # Preview del build
```

## 🎯 Características Técnicas Destacadas

- **Real-time Sync**: Uso de `onSnapshot` de Firestore para actualizaciones instantáneas
- **Optimistic UI**: Updates visuales inmediatos antes de confirmación del servidor
- **Responsive Design**: Navegación móvil con barra inferior estilo Instagram
- **Image Upload**: Integración con Cloudinary para fotos de perfil y posts
- **Event Delegation**: Manejo eficiente de eventos para mejor performance
- **Modular Code**: Separación clara de responsabilidades entre archivos
- **Vite Build**: Bundling moderno y rápido para producción

## 👨‍💻 Autor

**Vicenzo Scavino**

- GitHub: [@vicenzoscavino1999](https://github.com/vicenzoscavino1999)

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.

---

⚡ Hecho con pasión en 2024
