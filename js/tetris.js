"use strict";

class Game {
    // Square length in pixels / longitud total en píxeles
    static SQUARE_LENGTH = screen.width > 420 ? 30 : 20;
    static COLUMNS = 10;
    static ROWS = 20;
    static CANVAS_WIDTH = this.SQUARE_LENGTH * this.COLUMNS;
    static CANVAS_HEIGHT = this.SQUARE_LENGTH * this.ROWS;
    static EMPTY_COLOR = "#45E3BC";
    static BORDER_COLOR = "#ffffff";
    static DELETED_ROW_COLOR = "#d81c38";
    // When a piece collapses with something at its bottom, how many time wait for putting another piece? (in ms) / Cuando una pieza se derrumba con algo en su parte inferior, ¿cuánto tiempo espera para poner otra pieza? (en ms)
    static TIMEOUT_LOCK_PUT_NEXT_PIECE = 300;
    // Speed of falling piece (in ms) / Velocidad de caída de la pieza (en ms)
    static PIECE_SPEED = 300;
    // Animation time when a row is being deleted / Tiempo de animación cuando se borra una fila
    static DELETE_ROW_ANIMATION = 500;
    // Score to add when a square dissapears (for each square)/ Puntuación para sumar cuando desaparece un cuadrado (para cada cuadrado)
    static PER_SQUARE_SCORE = 1;
    static COLORS = [
        "#ffd300",
        "#de38c8",
        "#652ec7",
        "#33135c",
        "#13ca91",
        "#ff9472",
        "#35212a",
        "#ff8b8b",
        "#28cf75",
        "#00a9fe",
        "#04005e",
        "#120052",
        "#272822",
        "#f92672",
        "#66d9ef",
        "#a6e22e",
        "#fd971f",
    ];

    constructor(canvasId) {
        this.canvasId = canvasId;
        this.timeoutFlag = false;
        this.board = [];
        this.existingPieces = [];
        this.globalX = 0;
        this.globalY = 0;
        this.paused = true;
        this.currentFigure = null;
        this.sounds = {};
        this.canPlay = false;
        this.intervalId = null;
        this.init();
    }

    init() {
        this.showWelcome();
        this.initDomElements();
        this.initSounds();
        this.resetGame();
        this.draw();
        this.initControls();
    }

    resetGame() {
        this.score = 0;
        this.sounds.success.currentTime = 0;
        this.sounds.success.pause();
        this.sounds.background.currentTime = 0;
        this.sounds.background.pause();
        this.initBoardAndExistingPieces();
        this.chooseRandomFigure();
        this.restartGlobalXAndY();
        this.syncExistingPiecesWithBoard();
        this.refreshScore();
        this.pauseGame();
    }
    //ventana flotante / floating window
    showWelcome() {
        Swal.fire(
            "Bienvenido",
            `Juego de Tetris en JavaScript.
<br>
<strong>Controles:</strong>
<ul class="list-group">
<li class="list-group-item"> <kbd>P</kbd><br>Pausar o reanudar </li>
<li class="list-group-item"> <kbd>R</kbd><br>Rotar</li>
<li class="list-group-item"> <kbd>Flechas de dirección</kbd><br>Mover figura hacia esa dirección</li>
<li class="list-group-item"><strong>También puedes usar los botones si estás en móvil</strong></li>
</ul>
    `
        );
    }

    initControls() {
        document.addEventListener("keydown", (e) => {
            const { code } = e;
            if (!this.canPlay && code !== "KeyP") {
                return;
            }
            switch (code) {
                case "ArrowRight":
                    this.attemptMoveRight();
                    break;
                case "ArrowLeft":
                    this.attemptMoveLeft();
                    break;
                case "ArrowDown":
                    this.attemptMoveDown();
                    break;
                case "KeyR":
                    this.attemptRotate();
                    break;
                case "KeyP":
                    this.pauseOrResumeGame();
                    break;
            }
            this.syncExistingPiecesWithBoard();
        });

        this.$btnDown.addEventListener("click", () => {
            if (!this.canPlay) return;
            this.attemptMoveDown();
        });
        this.$btnRight.addEventListener("click", () => {
            if (!this.canPlay) return;
            this.attemptMoveRight();
        });
        this.$btnLeft.addEventListener("click", () => {
            if (!this.canPlay) return;
            this.attemptMoveLeft();
        });
        this.$btnRotate.addEventListener("click", () => {
            if (!this.canPlay) return;
            this.attemptRotate();
        });
        [this.$btnPause, this.$btnResume].forEach(($btn) =>
            $btn.addEventListener("click", () => {
                this.pauseOrResumeGame();
            })
        );
    }

    attemptMoveRight() {
        if (this.figureCanMoveRight()) {
            this.globalX++;
        }
    }

    attemptMoveLeft() {
        if (this.figureCanMoveLeft()) {
            this.globalX--;
        }
    }

    attemptMoveDown() {
        if (this.figureCanMoveDown()) {
            this.globalY++;
        }
    }

    attemptRotate() {
        this.rotateFigure();
    }

    pauseOrResumeGame() {
        if (this.paused) {
            this.resumeGame();
            this.$btnResume.hidden = true;
            this.$btnPause.hidden = false;
        } else {
            this.pauseGame();
            this.$btnResume.hidden = false;
            this.$btnPause.hidden = true;
        }
    }

    pauseGame() {
        this.sounds.background.pause();
        this.paused = true;
        this.canPlay = false;
        clearInterval(this.intervalId);
    }

    resumeGame() {
        this.sounds.background.play();
        this.refreshScore();
        this.paused = false;
        this.canPlay = true;
        this.intervalId = setInterval(
            this.mainLoop.bind(this),
            Game.PIECE_SPEED
        );
    }

    moveFigurePointsToExistingPieces() {
        this.canPlay = false;
        for (const point of this.currentFigure.getPoints()) {
            point.x += this.globalX;
            point.y += this.globalY;
            this.existingPieces[point.y][point.x] = {
                taken: true,
                color: point.color,
            };
        }
        this.restartGlobalXAndY();
        this.canPlay = true;
    }

    playerLoses() {
        // Check if there's something at Y 1. Maybe it is not fair for the player, but it works / compruebe si hay algo en Y 1. Tal vez no sea justo para el jugador, pero funciona
        for (const point of this.existingPieces[1]) {
            if (point.taken) {
                return true;
            }
        }
        return false;
    }

    getPointsToDelete = () => {
        const points = [];
        let y = 0;
        for (const row of this.existingPieces) {
            const isRowFull = row.every((point) => point.taken);
            if (isRowFull) {
                // We only need the Y coordinate
                points.push(y);
            }
            y++;
        }
        return points;
    };

    changeDeletedRowColor(yCoordinates) {
        for (let y of yCoordinates) {
            for (const point of this.existingPieces[y]) {
                point.color = Game.DELETED_ROW_COLOR;
            }
        }
    }

    addScore(rows) {
        this.score += Game.PER_SQUARE_SCORE * Game.COLUMNS * rows.length;
        this.refreshScore();
    }

    removeRowsFromExistingPieces(yCoordinates) {
        for (let y of yCoordinates) {
            for (const point of this.existingPieces[y]) {
                point.color = Game.EMPTY_COLOR;
                point.taken = false;
            }
        }
    }

    verifyAndDeleteFullRows() {
        // Here be dragons /Aquí hay dragones / verifica y elimina las filas
        const yCoordinates = this.getPointsToDelete();
        if (yCoordinates.length <= 0) return;
        this.addScore(yCoordinates);
        this.sounds.success.currentTime = 0;
        this.sounds.success.play();
        this.changeDeletedRowColor(yCoordinates);
        this.canPlay = false;
        setTimeout(() => {
            this.sounds.success.pause();
            this.removeRowsFromExistingPieces(yCoordinates);
            this.syncExistingPiecesWithBoard();
            const invertedCoordinates = Array.from(yCoordinates);
            // Now the coordinates are in descending order / Ahora las coordenadas están en orden descendente
            invertedCoordinates.reverse();

            for (let yCoordinate of invertedCoordinates) {
                for (let y = Game.ROWS - 1; y >= 0; y--) {
                    for (let x = 0; x < this.existingPieces[y].length; x++) {
                        if (y < yCoordinate) {
                            let counter = 0;
                            let auxiliarY = y;
                            while (
                                this.isEmptyPoint(x, auxiliarY + 1) &&
                                !this.absolutePointOutOfLimits(
                                    x,
                                    auxiliarY + 1
                                ) &&
                                counter < yCoordinates.length
                            ) {
                                this.existingPieces[auxiliarY + 1][x] =
                                    this.existingPieces[auxiliarY][x];
                                this.existingPieces[auxiliarY][x] = {
                                    color: Game.EMPTY_COLOR,
                                    taken: false,
                                };

                                this.syncExistingPiecesWithBoard();
                                counter++;
                                auxiliarY++;
                            }
                        }
                    }
                }
            }

            this.syncExistingPiecesWithBoard();
            this.canPlay = true;
        }, Game.DELETE_ROW_ANIMATION);
    }

    mainLoop() {
        if (!this.canPlay) {
            return;
        }
        // If figure can move down, move down / Si la figura puede moverse hacia abajo, muévase hacia abajo
        if (this.figureCanMoveDown()) {
            this.globalY++;
        } else {
            // If figure cannot, then we start a timeout because / Si la cifra no puede, iniciamos un tiempo de espera porque
            // player can move figure to keep it going down / El jugador puede mover la figura para mantenerlo bajando
            // for example when the figure collapses with another points but there's remaining / por ejemplo, cuando la figura se colapsa con otros puntos pero quedan
            // space at the left or right and the player moves there so the figure can keep going down / ritmo a la izquierda o derecha y el jugador se mueve allí para que la figura pueda seguir bajando
            if (this.timeoutFlag) return;
            this.timeoutFlag = true;
            setTimeout(() => {
                this.timeoutFlag = false;
                // If the time expires, we re-check if figure cannot keep going down. If it can /Si el tiempo expira, volvemos a verificar si la cifra no puede seguir bajando. Si puede
                // (because player moved it) then we return and keep the loop / porque el jugador lo movió) luego regresamos y mantenemos el bucle
                if (this.figureCanMoveDown()) {
                    return;
                }
                // At this point, we know that the figure collapsed either with the floor / En este punto, sabemos que la figura colapsó con el suelo
                // or with another point. So we move all the figure to the existing pieces array / o con otro punto. Entonces movemos toda la figura a la matriz de piezas existente.
                this.sounds.tap.currentTime = 0;
                this.sounds.tap.play();
                this.moveFigurePointsToExistingPieces();
                if (this.playerLoses()) {
                    Swal.fire("Juego terminado", "Inténtalo de nuevo");
                    this.sounds.background.pause();
                    this.canPlay = false;
                    this.resetGame();
                    return;
                }
                this.verifyAndDeleteFullRows();
                this.chooseRandomFigure();
                this.syncExistingPiecesWithBoard();
            }, Game.TIMEOUT_LOCK_PUT_NEXT_PIECE);
        }
        this.syncExistingPiecesWithBoard();
    }