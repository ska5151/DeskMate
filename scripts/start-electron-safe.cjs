const fs = require('fs');
const path = require('path');
const net = require('net');
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

function checkPortOpen(port, timeoutMs = 600) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, '127.0.0.1');
  });
}

function launchElectron(useDistFile = false) {
  const env = { ...process.env };
  if (useDistFile) {
    env.USE_DIST_FILE = '1';
  }
  const child = spawn(electronBinaryPath, ['.'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

(async () => {
  const isViteUp = await checkPortOpen(5173, 600);
  if (isViteUp) {
    launchElectron(false);
    return;
  }

  const distIndex = path.join(__dirname, '..', 'dist', 'index.html');
  if (fs.existsSync(distIndex)) {
    // dist/index.html이 이미 빌드되어 있으면 기다리지 않고 즉시 실행!
    launchElectron(true);
    return;
  }

  const waitOn = require('wait-on');
  waitOn({
    resources: ['tcp:5173'],
    timeout: 8000,
  })
    .then(() => {
      launchElectron(false);
    })
    .catch(() => {
      launchElectron(true);
    });
})();
