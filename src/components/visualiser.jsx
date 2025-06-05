import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Play, Pause, Square, Car, Navigation } from "lucide-react";

const GRID_ROWS = 60;
const GRID_COLS = 120;
const CELL_SIZE = 8;

const LiveTrafficVisualizer = () => {
  const [algorithm, setAlgorithm] = useState("astar");
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [grid, setGrid] = useState([]);
  const [cars, setCars] = useState([]);
  const [isPathfinding, setIsPathfinding] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [visitedNodes, setVisitedNodes] = useState(new Set());

  // Analytics
  const [stats, setStats] = useState({
    nodesExplored: 0,
    pathLength: 0,
    executionTime: 0,
    recalculations: 0,
  });

  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  // Car colors for different directions
  const CAR_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', 
    '#DDA0DD', '#FF9F43', '#6AB04C', '#EB4D4B', '#7F8C8D',
    '#E056FD', '#686DE0', '#30336B', '#95A5A6', '#F1C40F'
  ];

  // Initialize city grid with roads and buildings
  const initializeCityGrid = useCallback(() => {
    const newGrid = Array(GRID_ROWS)
      .fill()
      .map(() =>
        Array(GRID_COLS)
          .fill()
          .map(() => ({
            isWall: true,
            isRoad: false,
            isVisited: false,
            isPath: false,
            hasCar: false,
            carId: null,
          }))
      );

    // Create main roads (horizontal)
    for (let y = 8; y < GRID_ROWS; y += 12) {
      for (let x = 0; x < GRID_COLS; x++) {
        for (let roadY = 0; roadY < 2; roadY++) {
          if (y + roadY < GRID_ROWS) {
            newGrid[y + roadY][x].isWall = false;
            newGrid[y + roadY][x].isRoad = true;
          }
        }
      }
    }

    // Create main roads (vertical)
    for (let x = 8; x < GRID_COLS; x += 16) {
      for (let y = 0; y < GRID_ROWS; y++) {
        for (let roadX = 0; roadX < 2; roadX++) {
          if (x + roadX < GRID_COLS) {
            newGrid[y][x + roadX].isWall = false;
            newGrid[y][x + roadX].isRoad = true;
          }
        }
      }
    }

    // Create additional connecting roads
    for (let y = 4; y < GRID_ROWS; y += 24) {
      for (let x = 0; x < GRID_COLS; x++) {
        if (newGrid[y] && newGrid[y][x]) {
          newGrid[y][x].isWall = false;
          newGrid[y][x].isRoad = true;
        }
      }
    }

    for (let x = 4; x < GRID_COLS; x += 32) {
      for (let y = 0; y < GRID_ROWS; y++) {
        if (newGrid[y] && newGrid[y][x]) {
          newGrid[y][x].isWall = false;
          newGrid[y][x].isRoad = true;
        }
      }
    }

    return newGrid;
  }, []);

  // Generate random cars for heavy traffic
  const generateCars = useCallback((grid) => {
    const newCars = [];
    const roadCells = [];

    // Find all road cells
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        if (grid[y][x].isRoad) {
          roadCells.push({ x, y });
        }
      }
    }

    // Generate 50-75 cars for heavy traffic
    const numCars = 50 + Math.floor(Math.random() * 26);
    const occupiedCells = new Set();

    for (let i = 0; i < numCars; i++) {
      let randomRoad;
      let attempts = 0;
      const maxAttempts = 10;

      // Ensure cars don't spawn on top of each other
      do {
        randomRoad = roadCells[Math.floor(Math.random() * roadCells.length)];
        attempts++;
      } while (
        occupiedCells.has(`${randomRoad.x},${randomRoad.y}`) &&
        attempts < maxAttempts
      );

      if (attempts >= maxAttempts) continue;

      occupiedCells.add(`${randomRoad.x},${randomRoad.y}`);
      const direction = Math.floor(Math.random() * 4); // 0: right, 1: down, 2: left, 3: up
      const speed = 0.2 + Math.random() * 0.5; // Slower speed for heavy traffic (0.2-0.7)

      newCars.push({
        id: i,
        x: randomRoad.x,
        y: randomRoad.y,
        direction,
        speed,
        color: CAR_COLORS[i % CAR_COLORS.length],
        stuckTime: 0,
      });
    }

    return newCars;
  }, []);

  // Initialize grid and cars
  useEffect(() => {
    const initialGrid = initializeCityGrid();
    setGrid(initialGrid);
    setCars(generateCars(initialGrid));
  }, [initializeCityGrid, generateCars]);

  // Get valid neighbors for pathfinding
  const getNeighbors = useCallback((node, currentGrid) => {
    const neighbors = [];
    const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // right, down, left, up

    for (const [dx, dy] of directions) {
      const newX = node.x + dx;
      const newY = node.y + dy;

      if (
        newX >= 0 &&
        newX < GRID_COLS &&
        newY >= 0 &&
        newY < GRID_ROWS &&
        !currentGrid[newY][newX].isWall &&
        !currentGrid[newY][newX].hasCar
      ) {
        neighbors.push({ x: newX, y: newY });
      }
    }

    return neighbors;
  }, []);

  // Manhattan distance heuristic for A*
  const heuristic = useCallback((node, goal) => {
    return Math.abs(node.x - goal.x) + Math.abs(node.y - goal.y);
  }, []);

  // DFS pathfinding algorithm
  const runDFS = useCallback(async (currentGrid, start, end) => {
    const stack = [{ x: start.x, y: start.y }];
    const visited = new Set([`${start.x},${start.y}`]);
    const parent = new Map();
    let exploredCount = 0;

    while (stack.length > 0) {
      const current = stack.pop();
      exploredCount++;

      if (current.x === end.x && current.y === end.y) {
        const path = [];
        let curr = current;
        while (curr) {
          path.unshift({ x: curr.x, y: curr.y });
          curr = parent.get(`${curr.x},${curr.y}`);
        }
        return { path, exploredCount };
      }

      const neighbors = getNeighbors(current, currentGrid);
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (!visited.has(neighborKey)) {
          visited.add(neighborKey);
          parent.set(neighborKey, current);
          stack.push(neighbor);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 10));
    }

    return { path: [], exploredCount };
  }, [getNeighbors]);

  // BFS pathfinding algorithm
  const runBFS = useCallback(async (currentGrid, start, end) => {
    const queue = [{ x: start.x, y: start.y }];
    const visited = new Set([`${start.x},${start.y}`]);
    const parent = new Map();
    let exploredCount = 0;

    while (queue.length > 0) {
      const current = queue.shift();
      exploredCount++;

      if (current.x === end.x && current.y === end.y) {
        const path = [];
        let curr = current;
        while (curr) {
          path.unshift({ x: curr.x, y: curr.y });
          curr = parent.get(`${curr.x},${curr.y}`);
        }
        return { path, exploredCount };
      }

      const neighbors = getNeighbors(current, currentGrid);
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (!visited.has(neighborKey)) {
          visited.add(neighborKey);
          parent.set(neighborKey, current);
          queue.push(neighbor);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 10));
    }

    return { path: [], exploredCount };
  }, [getNeighbors]);

  // A* pathfinding algorithm
  const runAStar = useCallback(async (currentGrid, start, end) => {
    const openSet = [{ x: start.x, y: start.y, f: 0, g: 0, h: heuristic(start, end) }];
    const closedSet = new Set();
    const cameFrom = new Map();
    let exploredCount = 0;

    while (openSet.length > 0) {
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift();
      const currentKey = `${current.x},${current.y}`;

      if (current.x === end.x && current.y === end.y) {
        const path = [];
        let curr = current;
        while (curr) {
          path.unshift({ x: curr.x, y: curr.y });
          curr = cameFrom.get(`${curr.x},${curr.y}`);
        }
        return { path, exploredCount };
      }

      closedSet.add(currentKey);
      exploredCount++;

      const neighbors = getNeighbors(current, currentGrid);
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (closedSet.has(neighborKey)) continue;

        const tentativeG = current.g + 1;
        const existingNode = openSet.find(n => n.x === neighbor.x && n.y === neighbor.y);

        if (!existingNode || tentativeG < existingNode.g) {
          const h = heuristic(neighbor, end);
          const neighborNode = {
            x: neighbor.x,
            y: neighbor.y,
            g: tentativeG,
            h,
            f: tentativeG + h,
          };

          cameFrom.set(neighborKey, current);

          if (!existingNode) {
            openSet.push(neighborNode);
          } else {
            existingNode.g = tentativeG;
            existingNode.f = tentativeG + h;
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 5));
    }

    return { path: [], exploredCount };
  }, [getNeighbors, heuristic]);

  // Dijkstra's pathfinding algorithm
  const runDijkstra = useCallback(async (currentGrid, start, end) => {
    const distances = Array(GRID_ROWS)
      .fill()
      .map(() => Array(GRID_COLS).fill(Infinity));
    const parent = new Map();
    const priorityQueue = [{ x: start.x, y: start.y, dist: 0 }];
    const visited = new Set();
    let exploredCount = 0;

    distances[start.y][start.x] = 0;

    while (priorityQueue.length > 0) {
      priorityQueue.sort((a, b) => a.dist - b.dist);
      const current = priorityQueue.shift();
      const currentKey = `${current.x},${current.y}`;

      if (visited.has(currentKey)) continue;
      visited.add(currentKey);
      exploredCount++;

      if (current.x === end.x && current.y === end.y) {
        const path = [];
        let curr = { x: end.x, y: end.y };
        while (curr) {
          path.unshift({ x: curr.x, y: curr.y });
          curr = parent.get(`${curr.x},${curr.y}`);
        }
        return { path, exploredCount };
      }

      const neighbors = getNeighbors(current, currentGrid);
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (visited.has(neighborKey)) continue;

        const newDist = distances[current.y][current.x] + 1;
        if (newDist < distances[neighbor.y][neighbor.x]) {
          distances[neighbor.y][neighbor.x] = newDist;
          parent.set(neighborKey, current);
          priorityQueue.push({ x: neighbor.x, y: neighbor.y, dist: newDist });
        }
      }

      await new Promise(resolve => setTimeout(resolve, 5));
    }

    return { path: [], exploredCount };
  }, [getNeighbors]);

  // Run pathfinding with current algorithm
  const runPathfinding = useCallback(async () => {
    if (!startPoint || !endPoint || isPathfinding) return;

    setIsPathfinding(true);
    setVisitedNodes(new Set());
    setCurrentPath([]);

    const startTime = Date.now();

    // Get current grid state with car positions
    const currentGrid = grid.map((row, y) =>
      row.map((cell, x) => ({
        ...cell,
        hasCar: cars.some(car => Math.floor(car.x) === x && Math.floor(car.y) === y),
      }))
    );

    let result;
    if (algorithm === "astar") {
      result = await runAStar(currentGrid, startPoint, endPoint);
    } else if (algorithm === "bfs") {
      result = await runBFS(currentGrid, startPoint, endPoint);
    } else if (algorithm === "dfs") {
      result = await runDFS(currentGrid, startPoint, endPoint);
    } else if (algorithm === "dijkstra") {
      result = await runDijkstra(currentGrid, startPoint, endPoint);
    }

    const executionTime = (Date.now() - startTime) / 1000;

    setCurrentPath(result.path);
    setStats(prev => ({
      ...prev,
      nodesExplored: result.exploredCount,
      pathLength: result.path.length,
      executionTime,
      recalculations: prev.recalculations + 1,
    }));

    setIsPathfinding(false);
  }, [startPoint, endPoint, isPathfinding, grid, cars, algorithm, runAStar, runBFS, runDFS, runDijkstra]);

  // Move cars
  const moveCars = useCallback(() => {
    setCars(prevCars => {
      return prevCars.map(car => {
        const directions = [
          { dx: 1, dy: 0 }, // right
          { dx: 0, dy: 1 }, // down
          { dx: -1, dy: 0 }, // left
          { dx: 0, dy: -1 }, // up
        ];

        const dir = directions[car.direction];
        let newX = car.x + dir.dx * car.speed;
        let newY = car.y + dir.dy * car.speed;

        // Check boundaries and walls
        const nextCellX = Math.floor(newX);
        const nextCellY = Math.floor(newY);

        if (
          nextCellX < 0 ||
          nextCellX >= GRID_COLS ||
          nextCellY < 0 ||
          nextCellY >= GRID_ROWS ||
          (grid[nextCellY] && grid[nextCellY][nextCellX] && grid[nextCellY][nextCellX].isWall)
        ) {
          return {
            ...car,
            direction: Math.floor(Math.random() * 4),
            stuckTime: 0,
          };
        }

        // Check for collisions with other cars (tighter collision radius for heavy traffic)
        const collision = prevCars.some(
          otherCar =>
            otherCar.id !== car.id &&
            Math.abs(otherCar.x - newX) < 0.8 &&
            Math.abs(otherCar.y - newY) < 0.8
        );

        if (collision) {
          if (car.stuckTime > 20) { // Reduced stuck time for quicker direction changes
            return {
              ...car,
              direction: (car.direction + 1 + Math.floor(Math.random() * 2)) % 4,
              stuckTime: 0,
            };
          }
          return { ...car, stuckTime: car.stuckTime + 1 };
        }

        // Random direction change (less frequent in heavy traffic)
        if (Math.random() < 0.001) {
          return {
            ...car,
            direction: Math.floor(Math.random() * 4),
            x: newX,
            y: newY,
            stuckTime: 0,
          };
        }

        return {
          ...car,
          x: newX,
          y: newY,
          stuckTime: 0,
        };
      });
    });
  }, [grid]);

  // Animation loop
  useEffect(() => {
    if (isSimulationRunning) {
      const animate = () => {
        moveCars();
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isSimulationRunning, moveCars]);

  // Continuous pathfinding when simulation is running
  useEffect(() => {
    if (isSimulationRunning && startPoint && endPoint) {
      const interval = setInterval(() => {
        if (!isPathfinding) {
          runPathfinding();
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isSimulationRunning, startPoint, endPoint, isPathfinding, runPathfinding]);

  // Draw on canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        ctx.fillStyle = cell.isWall ? '#2C3E50' : '#ECF0F1';
        if (cell.isRoad) ctx.fillStyle = '#BDC3C7';
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);

        // Draw grid lines
        ctx.strokeStyle = '#95A5A6';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      });
    });

    // Draw current path
    currentPath.forEach((node, index) => {
      ctx.fillStyle = '#E8C1FF';
      ctx.fillRect(
        node.x * CELL_SIZE + 1,
        node.y * CELL_SIZE + 1,
        CELL_SIZE - 2,
        CELL_SIZE - 2
      );
    });

    // Draw cars (smaller size for clarity in heavy traffic)
    cars.forEach(car => {
      const centerX = car.x * CELL_SIZE + CELL_SIZE / 2;
      const centerY = car.y * CELL_SIZE + CELL_SIZE / 2;

      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.arc(centerX, centerY, CELL_SIZE / 3.5, 0, 2 * Math.PI); // Reduced car size
      ctx.fill();

      // Draw direction indicator
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      const dirs = [
        [CELL_SIZE / 5, 0], // right
        [0, CELL_SIZE / 5], // down
        [-CELL_SIZE / 5, 0], // left
        [0, -CELL_SIZE / 5], // up
      ];
      const [dx, dy] = dirs[car.direction];
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + dx, centerY + dy);
      ctx.stroke();
    });

    // Draw start and end points
    if (startPoint) {
      ctx.fillStyle = '#27AE60';
      ctx.beginPath();
      ctx.arc(
        startPoint.x * CELL_SIZE + CELL_SIZE / 2,
        startPoint.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2.5,
        0,
        2 * Math.PI
      );
      ctx.fill();
    }

    if (endPoint) {
      ctx.fillStyle = '#E74C3C';
      ctx.beginPath();
      ctx.arc(
        endPoint.x * CELL_SIZE + CELL_SIZE / 2,
        endPoint.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2.5,
        0,
        2 * Math.PI
      );
      ctx.fill();
    }
  }, [grid, cars, currentPath, startPoint, endPoint]);

  // Redraw canvas when state changes
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Handle canvas clicks
  const handleCanvasClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);

    if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) return;

    // Only allow clicks on road cells without cars
    if (
      grid[y] &&
      grid[y][x] &&
      !grid[y][x].isWall &&
      !cars.some(car => Math.floor(car.x) === x && Math.floor(car.y) === y)
    ) {
      if (!startPoint) {
        setStartPoint({ x, y });
      } else if (!endPoint) {
        setEndPoint({ x, y });
      } else {
        setStartPoint({ x, y });
        setEndPoint(null);
        setCurrentPath([]);
      }
    }
  };

  // Reset simulation
  const resetSimulation = () => {
    setIsSimulationRunning(false);
    setStartPoint(null);
    setEndPoint(null);
    setCurrentPath([]);
    setStats({ nodesExplored: 0, pathLength: 0, executionTime: 0, recalculations: 0 });
    const newGrid = initializeCityGrid();
    setGrid(newGrid);
    setCars(generateCars(newGrid));
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex gap-4 mb-4 items-center flex-wrap">
        <Select value={algorithm} onValueChange={setAlgorithm}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Select Algorithm" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="astar">A* Algorithm</SelectItem>
            <SelectItem value="bfs">BFS</SelectItem>
            <SelectItem value="dfs">DFS</SelectItem>
            <SelectItem value="dijkstra">Dijkstra's Algorithm</SelectItem>
          </SelectContent>
        </Select>

        <Button
          onClick={() => setIsSimulationRunning(!isSimulationRunning)}
          variant={isSimulationRunning ? "destructive" : "default"}
        >
          {isSimulationRunning ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
          {isSimulationRunning ? "Pause Traffic" : "Start Traffic"}
        </Button>

        <Button onClick={resetSimulation} variant="outline">
          <Square className="w-4 h-4 mr-2" />
          Reset
        </Button>

        <Button
          onClick={runPathfinding}
          disabled={!startPoint || !endPoint || isPathfinding}
          variant="outline"
        >
          <Navigation className="w-4 h-4 mr-2" />
          Find Path
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Car className="w-4 h-4" />
              Live Cars
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="text-2xl font-bold">{cars.length}</div>
            <p className="text-xs text-gray-500">Moving vehicles</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Nodes Explored</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="text-2xl font-bold">{stats.nodesExplored}</div>
            <p className="text-xs text-gray-500">Cells visited</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Path Length</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="text-2xl font-bold">{stats.pathLength}</div>
            <p className="text-xs text-gray-500">Steps to destination</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Recalculations</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="text-2xl font-bold">{stats.recalculations}</div>
            <p className="text-xs text-gray-500">Path updates</p>
          </CardContent>
        </Card>
      </div>

      <div className="border rounded-lg p-4 bg-gray-50">
        <canvas
          ref={canvasRef}
          width={GRID_COLS * CELL_SIZE}
          height={GRID_ROWS * CELL_SIZE}
          onClick={handleCanvasClick}
          className="border bg-white cursor-pointer shadow-inner"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Instructions</CardTitle>
          </CardHeader>
          <CardContent className="py-2 space-y-1">
            <p>• Click on roads to set start point (green)</p>
            <p>• Click again to set destination (red)</p>
            <p>• Start traffic simulation to see live cars</p>
            <p>• Path updates automatically as cars move</p>
            <p>• Purple blocks show the current optimal path</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Heavy Traffic Features</CardTitle>
          </CardHeader>
          <CardContent className="py-2 space-y-1">
            <p>• 50-75 cars simulate heavy traffic conditions</p>
            <p>• Dynamic blockages force frequent path recalculation</p>
            <p>• Path updates every second during traffic</p>
            <p>• Cars avoid collisions and change directions</p>
            <p>
              •{" "}
              {algorithm === "astar"
                ? "A* uses heuristics for efficiency"
                : algorithm === "bfs"
                ? "BFS explores all options equally"
                : algorithm === "dfs"
                ? "DFS explores deeply before backtracking"
                : "Dijkstra finds shortest path with uniform weights"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LiveTrafficVisualizer;