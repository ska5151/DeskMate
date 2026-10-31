const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 1. Vercel 또는 CI 클라우드 빌드 서버 환경 감지 시 에러 없이 안전하게 종료
if (
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.CI ||
  process.env.NOW_REGION
) {
  console.log(
    '[DeskMate] Vercel/CI 클라우드 환경이 감지되어 Electron 데스크톱 창 실행을 건너뜁니다.'
  );
  process.exit(0);
}

// 2. 로컬 환경에서 Electron 바이너리(path.txt) 설치 여부 확인
const electronPathTxt = path.join(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'path.txt'
);

if (!fs.existsSync(electronPathTxt)) {
  console.warn(
    '[DeskMate 안내] Electron 실행 바이너리가 설치되어 있지 않아 데스크톱 창 실행을 건너뜁니다. (설치 필요 시: node node_modules/electron/install.js)'
  );
  process.exit(0);
}

const electronExecutableRel = fs.readFileSync(electronPathTxt, 'utf-8').trim();
const electronBinaryPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'dist',
  electronExecutableRel
);

if (!fs.existsSync(electronBinaryPath)) {
  console.warn(
    '[DeskMate 안내] Electron 바이너리 파일을 찾을 수 없어 데스크톱 창 실행을 건너뜁니다.'
  );
  process.exit(0);
}

// 3. 로컬 데스크톱 환경: 5173(Vite) 및 4000(Server) 준비 대기 후 Electron 실행
const waitOn = require('wait-on');

waitOn({
  resources: ['tcp:5173', 'tcp:4000'],
  timeout: 30000,
})
  .then(() => {
    const child = spawn(electronBinaryPath, ['.'], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });

    child.on('exit', (code) => {
      process.exit(code ?? 0);
    });
  })
  .catch((err) => {
    console.warn('[DeskMate] 서버 대기 타임아웃:', err.message);
    process.exit(0);
  });
