# ⚡ STRAFE THERAPY

<p align="center">
  <a href="https://brickstealer.github.io/strafetherapy/">
    <img src="https://img.shields.io/badge/🎮_PLAY_NOW-ONLINE_DEMO-00f0ff?style=for-the-badge&logo=googlechrome&logoColor=black" alt="Play Live Demo" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/brickstealer/strafetherapy/actions/workflows/deploy-pages.yml">
    <img src="https://github.com/brickstealer/strafetherapy/actions/workflows/deploy-pages.yml/badge.svg" alt="GitHub Pages Deployment Status" />
  </a>
  <a href="https://github.com/brickstealer/strafetherapy/actions/workflows/docker-publish.yml">
    <img src="https://github.com/brickstealer/strafetherapy/actions/workflows/docker-publish.yml/badge.svg" alt="Docker GHCR Build Status" />
  </a>
  <img src="https://img.shields.io/badge/Docker_Package-ghcr.io-24292e?logo=docker" alt="Docker Package" />
  <img src="https://img.shields.io/badge/Engine-Three.js_WebGL-ff0055?logo=three.js" alt="Three.js" />
  <img src="https://img.shields.io/badge/Physics-Quake_CPMA_125Hz-orange" alt="Quake CPMA 125Hz" />
</p>

---

> **Браузерный 3D симулятор классического Quake CPMA / Defrag мувмента, распрыжки, динамического скоринга и брутального мяса на движке Three.js & TypeScript.**

🌐 **Играть онлайн:** **[https://brickstealer.github.io/strafetherapy/](https://brickstealer.github.io/strafetherapy/)**

🐳 **Docker контейнер:** `ghcr.io/brickstealer/strafetherapy:latest`

---

## 🔥 Ключевые особенности

- 🚀 **Физика Quake CPMA 125 Hz:**
  - **Auto-Bunnyhop:** прыжки с сохранением импульса без трения о землю при зажатом `Пробеле`.
  - **Air-Strafing:** экспоненциальный разгон скорости синхронными движениями мыши и клавиш `A` / `D`.
  - **CPM Air-Control:** резкие развороты на 90° и 180° в воздухе с зажатой клавишей `W`.
  - **Rocket Jump:** мощные прыжки на взрывной волне под ноги.
- 🏰 **Двухуровневая Готическая Цитадель:**
  - Огромная арена диаметром 6 500 юнитов, 4 радиальных бастиона, факелы с динамическим пламенем и дымом.
  - Второй этаж (`y = 140`) с альтернативной геометрией, скоростными рампами, колоннадами и джамппадами для взлета на верхний ярус.
- 💀 **Мобы, Расчленёнка и Кровища (Brutal Gore System):**
  - Анимированные 3D-скелеты с реалистичным ригом и горящими демоническими глазницами.
  - При фатальном уроне враги **взрываются на физические гибсы** (черепа, рёбра, кости, позвонки и ошмётки мяса) с баллистическими отскоками от пола и стен.
  - Капли крови и декали на стенах и полу с настраиваемым временем жизни вплоть до **`∞ Бесконечно`** (без просадок FPS за счёт кольцевого буфера пула декалей).
- 🔫 **Арсенал оружия (переключение на 1, 2, 3 или Колёсико мыши):**
  - **[1] Shotgun:** 10 картечин с дробовым разлётом и отдачей.
  - **[2] Rocket Launcher:** снаряды с огненным шлейфом частиц и мощным радиусом сплэша (Rocket Jump).
  - **[3] Railgun:** классический Quake-ваншот со спиральным неоновым вихрем, лазерным лучом и пробивающим звуком разряда.
- ⚡ **HUD & Киберспортивный Скоринг:**
  - Цифровой спидометр и шкала Strafe Sync в реальном времени.
  - Неоновые световые трейлы за игроком с настраиваемой длительностью.
  - Множители комбо, счетчик фрагов и сохранение рекордов скорости в `localStorage`.
  - Ползунки FOV (до 150°), чувствительности мыши, уровня крови и длительности декалей в меню настроек (`ESC`).

---

## 🎮 Управление

| Клавиша / Ввод | Действие |
| :--- | :--- |
| **`Space` (зажать)** | Непрерывный авто-распрыг (Auto-Bunnyhop) |
| **`A` / `D` + Мышь** | Набор экспоненциальной скорости стрейфами |
| **`W` (в воздухе)** | CPM Air-Control поворот под 90° / 180° |
| **`ЛКМ` (Fire)** | Стрельба из текущего оружия (Дробовик / Ракетница / Рейлган) |
| **`1` / `2` / `3` / `Колесо` / `Q`** | Смена оружия |
| **`R`** | Мгновенный сброс позиции на стартовую полосу |
| **`Esc`** | Открыть меню настроек (FOV, Чувствительность, Кровь, Трейлы, Звук) |

---

## 🐳 Запуск через Docker

### Вариант 1: Запуск готового образа из GitHub Packages (GHCR)
```bash
docker run -d --name strafetherapy -p 8080:80 ghcr.io/brickstealer/strafetherapy:latest
```
После запуска игра доступна по адресу: **http://localhost:8080**

### Вариант 2: Запуск через Docker Compose
```bash
docker compose up -d
```

---

## 💻 Локальная разработка

Требуется [Node.js](https://nodejs.org/) v20+ и [pnpm](https://pnpm.io/).

```bash
# 1. Клонировать репозиторий
git clone https://github.com/brickstealer/strafetherapy.git
cd strafetherapy

# 2. Установить зависимости
pnpm install

# 3. Запустить dev-сервер (по умолчанию на 0.0.0.0:5173)
pnpm run dev

# 4. Собрать production-билд
pnpm run build
```

---

## 🛠️ Стек технологий

- **Ядро:** [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- **Рендерер:** [Three.js](https://threejs.org/) (PCF Soft Shadows, Instanced/Point Particles, Procedural Textures & Audio Synthesizer)
- **CI/CD:** [GitHub Actions](https://github.com/features/actions) $\rightarrow$ Автодеплой на [GitHub Pages](https://pages.github.com/) + Публикация контейнера в [GitHub Container Registry (GHCR)](https://ghcr.io)
- **Контейнеризация:** Docker (Multi-stage build на Alpine Linux + Nginx)
