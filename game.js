const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('game-container');

// UI要素
const scoreEl = document.getElementById('score');
const lifeEl = document.getElementById('life');
const screenTitle = document.getElementById('screen-title');
const screenGameover = document.getElementById('screen-gameover');
const screenClear = document.getElementById('screen-clear');

// ボタン
document.getElementById('start-btn').addEventListener('click', () => { currentStage = 1; startGame(); });
document.getElementById('retry-btn').addEventListener('click', () => { startGame(); });
document.getElementById('next-btn').addEventListener('click', nextStage);

// アセット
const imgOjisan = new Image();
imgOjisan.src = 'assets/ojisan.png';

const imgOjisanWinter = new Image();
imgOjisanWinter.src = 'assets/ojisan_winter.png';

const imgOjisanNaked = new Image();
imgOjisanNaked.src = 'assets/ojisan_naked.png';

// ゲームの状態管理
let gameState = 'title'; // 'title', 'playing', 'gameover', 'clear'
let currentStage = 1;
let score = 0;
let life = 3;
let paddleTimer = 0;
let paddleOriginalWidth = 90;

// キャンバスサイズ設定用
let GAME_WIDTH = 400;
let GAME_HEIGHT = 600;

// おじさんの描画サイズ等
let ojisanRect = { x: 0, y: 0, width: 0, height: 0 };

// Resize処理
function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    GAME_WIDTH = rect.width;
    GAME_HEIGHT = rect.height;

    // パドルの初期位置をリセット
    if (paddle) {
        paddle.y = GAME_HEIGHT - Math.max(paddle.height * 2, 40);
    }

    // おじさんの描画領域事前計算
    if (imgOjisan.complete && imgOjisanWinter.complete) {
        calcOjisanRect();
    }
}
window.addEventListener('resize', resizeCanvas);

function calcOjisanRect() {
    // 描画領域を少し縮小 (0.55倍) し、上寄せ (0.05) にしてパドルとの距離を確保
    const imgRatio = imgOjisan.width / imgOjisan.height;
    const drawHeight = GAME_HEIGHT * 0.55;
    const drawWidth = drawHeight * imgRatio;
    const drawX = (GAME_WIDTH - drawWidth) / 2;
    const drawY = GAME_HEIGHT * 0.05;
    ojisanRect = { x: drawX, y: drawY, width: drawWidth, height: drawHeight };
}

imgOjisan.onload = () => { if (imgOjisanWinter.complete) calcOjisanRect(); };
imgOjisanWinter.onload = () => { if (imgOjisan.complete) calcOjisanRect(); };

// ゲームオブジェクト群
let ball = null;
let paddle = null;
let blocks = [];
let effects = []; // 浮き出るテキストなど
let items = []; // ドロップアイテム

// 最初から初期化
function init() {
    score = 0;
    life = 3;
    setupStage();
}

// ステージのセットアップ
function setupStage() {
    updateUI();
    effects = [];
    items = [];
    paddleTimer = 0;
    calcOjisanRect(); // 再計算

    // パドルの生成（扇風機）
    paddle = {
        x: GAME_WIDTH / 2 - paddleOriginalWidth / 2,
        y: GAME_HEIGHT - 50,
        width: paddleOriginalWidth,
        height: 15,
        color: '#ff9800'
    };

    spawnBall();
    initBlocks();
}

function spawnBall() {
    ball = {
        x: paddle.x + paddle.width / 2,
        y: paddle.y - 12,
        vx: 4 * (Math.random() > 0.5 ? 1 : -1),
        vy: -5,
        baseSpeed: 5.5, // ボール初期速度を少しだけ落として難易度緩和
        radius: 8,
        active: false
    };
}

function initBlocks() {
    blocks = [];
    const cols = 8;
    const rows = 12;

    const blockWidth = ojisanRect.width / cols;
    const blockHeight = ojisanRect.height / rows;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const cx = col + 0.5 - cols / 2;
            const cy = row + 0.5 - rows / 2;

            if ((cx * cx) / (cols * cols / 4) + (cy * cy) / (rows * rows / 4) <= 1.2) {
                let isPants = (row >= rows - 3 && row <= rows - 2 && col >= 3 && col <= 4);
                let isAhoge = (row === 0 && (col === 3 || col === 4));

                if (currentStage === 1) {
                    blocks.push({
                        x: ojisanRect.x + col * blockWidth,
                        y: ojisanRect.y + row * blockHeight,
                        width: blockWidth,
                        height: blockHeight,
                        layer: isAhoge ? 1 : (isPants ? 2 : 1),
                        maxLayer: isAhoge ? 1 : (isPants ? 2 : 1),
                        isPants: isPants,
                        isAhoge: isAhoge
                    });
                } else if (currentStage === 2) {
                    // 全体を ojisan.png のブロックで覆う（スタート時はojisan.pngになる）
                    blocks.push({
                        x: ojisanRect.x + col * blockWidth,
                        y: ojisanRect.y + row * blockHeight,
                        width: blockWidth,
                        height: blockHeight,
                        layer: isPants ? 3 : 1, // パンツ部分は硬く(3回)、他は1回で壊れる
                        maxLayer: isPants ? 3 : 1,
                        isPants: isPants,
                        isAhoge: false
                    });
                }
            }
        }
    }
}

function startGame() {
    screenTitle.classList.remove('active');
    screenGameover.classList.remove('active');
    screenClear.classList.remove('active');

    if (gameState !== 'playing') {
        resizeCanvas();
        init();
        gameState = 'playing';
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    }
}

function nextStage() {
    screenClear.classList.remove('active');
    if (currentStage === 1) {
        currentStage = 2;
        resizeCanvas();
        setupStage();
        gameState = 'playing';
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    } else {
        currentStage = 1;
        startGame();
    }
}

function updateUI() {
    scoreEl.innerText = score;
    lifeEl.innerText = life;
}

// ゲームループ
let lastTime = performance.now();
function gameLoop(time) {
    if (gameState !== 'playing') return;
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// 状態の更新
function update() {
    // ==== ボールの動き ====
    if (ball.active) {
        ball.x += ball.vx;
        ball.y += ball.vy;

        // 壁との当たり判定
        if (ball.x - ball.radius < 0) {
            ball.x = ball.radius;
            ball.vx *= -1;
        } else if (ball.x + ball.radius > GAME_WIDTH) {
            ball.x = GAME_WIDTH - ball.radius;
            ball.vx *= -1;
        }

        if (ball.y - ball.radius < 0) {
            ball.y = ball.radius;
            ball.vy *= -1;
        }

        // ミス（一番下に落ちた）
        if (ball.y - ball.radius > GAME_HEIGHT) {
            life--;
            updateUI();
            if (life <= 0) {
                gameState = 'gameover';
                screenGameover.classList.add('active');
            } else {
                spawnBall();
            }
        }
    } else {
        // パドルに追従
        ball.x = paddle.x + paddle.width / 2;
        ball.y = paddle.y - ball.radius - 2;
    }

    // ==== パドルとの当たり判定 ====
    if (ball.active && ball.vy > 0) {
        if (ball.y + ball.radius > paddle.y &&
            ball.y - ball.radius < paddle.y + paddle.height &&
            ball.x + ball.radius > paddle.x &&
            ball.x - ball.radius < paddle.x + paddle.width) {

            ball.y = paddle.y - ball.radius;

            const hitPoint = ball.x - (paddle.x + paddle.width / 2);
            const normalizedHit = hitPoint / (paddle.width / 2);

            const maxBounceAngle = Math.PI / 3;
            const bounceAngle = normalizedHit * maxBounceAngle;

            ball.vx = ball.baseSpeed * Math.sin(bounceAngle);
            ball.vy = -Math.abs(ball.baseSpeed * Math.cos(bounceAngle));
        }
    }

    // ==== ブロック(衣服)との当たり判定 ====
    let blocksLeft = false;
    for (let i = 0; i < blocks.length; i++) {
        let b = blocks[i];
        if (b.layer > 0) {
            blocksLeft = true;

            let testX = ball.x;
            let testY = ball.y;

            if (ball.x < b.x) testX = b.x;
            else if (ball.x > b.x + b.width) testX = b.x + b.width;

            if (ball.y < b.y) testY = b.y;
            else if (ball.y > b.y + b.height) testY = b.y + b.height;

            let distX = ball.x - testX;
            let distY = ball.y - testY;
            let distance = Math.sqrt((distX * distX) + (distY * distY));

            if (distance <= ball.radius) { // ヒット
                b.layer--;
                score += 10;
                updateUI();

                let overlapX = ball.radius - Math.abs(distX);
                let overlapY = ball.radius - Math.abs(distY);

                if (overlapX < overlapY) {
                    ball.vx *= -1;
                    ball.x += ball.vx > 0 ? overlapX : -overlapX;
                } else {
                    ball.vy *= -1;
                    ball.y += ball.vy > 0 ? overlapY : -overlapY;
                }

                if (b.layer === 0) {
                    if (b.isAhoge) {
                        score += 300;
                        spawnTextEffect(b.x, b.y, "ハゲた！！");
                        ball.baseSpeed *= 1.3;
                        ball.vx *= 1.3;
                        ball.vy *= 1.3;
                        container.classList.add('shake');
                        setTimeout(() => container.classList.remove('shake'), 400);
                    } else {
                        score += 50;
                        spawnTextEffect(b.x, b.y);
                    }
                }

                // アイテムドロップ: ステージ2で30%の確率
                if (currentStage === 2 && Math.random() < 0.3) {
                    spawnItem(b.x + b.width / 2, b.y + b.height / 2);
                }

                break;
            }
        }
    }

    if (!blocksLeft && blocks.length > 0) {
        gameState = 'clear';
        screenClear.classList.add('active');
        if (currentStage === 1) {
            screenClear.querySelector('h1').innerHTML = "STAGE 1 CLEAR!!";
            screenClear.querySelector('p').innerHTML = "冬着を吹き飛ばした！<br>次はパンツを吹き飛ばせ！";
            screenClear.querySelector('#next-btn').innerHTML = "ステージ2へ";
        } else {
            screenClear.querySelector('h1').innerHTML = "ALL CLEAR!!";
            screenClear.querySelector('p').innerHTML = "見事にドラちゃんを全裸にした！";
            screenClear.querySelector('#next-btn').innerHTML = "最初から遊ぶ";
        }
    }

    // エフェクト更新
    effects.forEach(e => {
        e.y -= 0.5;  // 上昇速度を少し遅く
        e.opacity -= 0.008; // 表示時間を長くする（ゆっくり消える）
    });
    effects = effects.filter(e => e.opacity > 0);

    // パドルの効果タイマー更新
    if (paddleTimer > 0) {
        paddleTimer--;
        if (paddleTimer <= 0) {
            paddle.width = paddleOriginalWidth;
            paddle.color = '#ff9800';
            if (paddle.x + paddle.width > GAME_WIDTH) paddle.x = GAME_WIDTH - paddle.width;
        }
    }

    // アイテム更新
    for (let i = items.length - 1; i >= 0; i--) {
        let it = items[i];
        it.y += it.vy;

        // パドルとの当たり判定
        if (it.y + it.size > paddle.y && it.y < paddle.y + paddle.height &&
            it.x + it.size > paddle.x && it.x < paddle.x + paddle.width) {
            
            if (it.type === 'up') {
                paddle.width = paddleOriginalWidth * 1.5;
                paddle.color = '#ffeb3b';
                spawnTextEffect(paddle.x + paddle.width/2, paddle.y, "POWER UP!");
            } else {
                paddle.width = paddleOriginalWidth * 0.6;
                paddle.color = '#2196f3';
                spawnTextEffect(paddle.x + paddle.width/2, paddle.y, "POWER DOWN");
            }
            paddleTimer = 600; // 約10秒
            if (paddle.x + paddle.width > GAME_WIDTH) paddle.x = GAME_WIDTH - paddle.width;
            
            items.splice(i, 1);
            continue;
        }

        if (it.y > GAME_HEIGHT) {
            items.splice(i, 1);
        }
    }
}

function spawnItem(x, y) {
    const type = Math.random() > 0.5 ? 'up' : 'down';
    items.push({
        x: x,
        y: y,
        vy: 2,
        size: 20,
        type: type
    });
}

// 叫び声エフェクト生成
const screamWords = ["寒い！", "やめろ！", "風邪ひく！", "そこダメ！", "ひゃっ！"];
function spawnTextEffect(x, y, forceText = null) {
    if (forceText || Math.random() > 0.7) {
        const word = forceText || screamWords[Math.floor(Math.random() * screamWords.length)];
        effects.push({
            x: x + (Math.random() * 20 - 10),
            y: y,
            text: word,
            opacity: 1.0,
            color: forceText ? '#ffeb3b' : '#fff'
        });
    }
}

// 描画
function draw() {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 1. 下地の描画 (ステージ1はパンツおじさん、ステージ2は全裸おじさん)
    let baseImg = currentStage === 1 ? imgOjisan : imgOjisanNaked;
    if (baseImg.complete && ojisanRect.width > 0) {
        ctx.drawImage(baseImg, ojisanRect.x, ojisanRect.y, ojisanRect.width, ojisanRect.height);
    }

    // 2. ブロックの描画
    let blockSourceImg = currentStage === 1 ? imgOjisanWinter : imgOjisan;
    blocks.forEach(b => {
        if (b.layer > 0) {
            if (b.isAhoge) {
                ctx.beginPath();
                ctx.rect(b.x, b.y, b.width + 1, b.height + 1);
                ctx.fillStyle = '#222';
                ctx.fill();
            } else if (blockSourceImg.complete) {
                const sx = ((b.x - ojisanRect.x) / ojisanRect.width) * blockSourceImg.width;
                const sy = ((b.y - ojisanRect.y) / ojisanRect.height) * blockSourceImg.height;
                const sw = (b.width / ojisanRect.width) * blockSourceImg.width;
                const sh = (b.height / ojisanRect.height) * blockSourceImg.height;

                if (b.layer < b.maxLayer) {
                    ctx.globalAlpha = 0.5 + (b.layer / b.maxLayer) * 0.5;
                }

                ctx.drawImage(
                    blockSourceImg,
                    sx, sy, sw, sh,
                    b.x, b.y, b.width + 1, b.height + 1
                );
                ctx.globalAlpha = 1.0;

                ctx.strokeStyle = 'rgba(0,0,0, 0.05)';
                ctx.strokeRect(b.x, b.y, b.width, b.height);
            }
        }
    });

    // アイテムの描画
    items.forEach(it => {
        ctx.fillStyle = it.type === 'up' ? '#ffeb3b' : '#2196f3';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(it.x - it.size/2, it.y, it.size, it.size, 5);
        } else {
            ctx.fillRect(it.x - it.size/2, it.y, it.size, it.size);
        }
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.stroke();
        
        ctx.fillStyle = '#000';
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(it.type.toUpperCase(), it.x, it.y + 14);
        ctx.textAlign = "left"; // reset
    });

    // 3. パドルの描画
    ctx.fillStyle = paddle.color;
    // 扇風機らしさを出すための飾り
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    ctx.fillStyle = '#ccc';
    ctx.fillRect(paddle.x + paddle.width / 2 - 5, paddle.y + paddle.height, 10, 20); // 持ち手

    // 4. ボールの描画
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#cccccc';
    ctx.stroke();

    // 5. エフェクトの描画
    effects.forEach(e => {
        ctx.font = "bold 20px 'M PLUS Rounded 1c'";
        ctx.fillStyle = `rgba(255, 255, 255, ${e.opacity})`;
        ctx.strokeStyle = `rgba(0, 0, 0, ${e.opacity})`;
        ctx.lineWidth = 3;
        ctx.strokeText(e.text, e.x, e.y);
        ctx.fillText(e.text, e.x, e.y);
    });
}

// === 操作周り ===
let isDragging = false;
canvas.addEventListener('mousedown', (e) => startMove(e.clientX));
canvas.addEventListener('mousemove', (e) => movePaddle(e.clientX));
window.addEventListener('mouseup', () => isDragging = false);

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startMove(e.touches[0].clientX);
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    movePaddle(e.touches[0].clientX);
}, { passive: false });
window.addEventListener('touchend', () => isDragging = false);

function startMove(clientX) {
    if (gameState !== 'playing') return;
    isDragging = true;
    if (ball && !ball.active) {
        ball.active = true;
    }
}

function movePaddle(clientX) {
    if (!isDragging || gameState !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;

    paddle.x = x - paddle.width / 2;
    if (paddle.x < 0) paddle.x = 0;
    if (paddle.x + paddle.width > GAME_WIDTH) paddle.x = GAME_WIDTH - paddle.width;
}

resizeCanvas();
