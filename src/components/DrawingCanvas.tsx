import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Palette, Pencil } from "lucide-react";
import { DrawingEvent } from "@/types/game";

interface DrawingCanvasProps {
  isDrawer: boolean;
  onDrawingEvent?: (event: DrawingEvent) => void;
  remoteEvents?: DrawingEvent[];
}

const colors = [
  "#000000", "#FF0000", "#00FF00", "#0000FF",
  "#FFFF00", "#FF00FF", "#00FFFF", "#FFA500"
];

const DrawingCanvas = ({ isDrawer, onDrawingEvent, remoteEvents }: DrawingCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);

  // Initialize and resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Save current drawing
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Set canvas size to match display size
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      // Restore or initialize
      if (imageData.width > 0) {
        ctx.putImageData(imageData, 0, 0);
      } else {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  useEffect(() => {
    if (!remoteEvents || remoteEvents.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    remoteEvents.forEach((event) => {
      if (event.type === "clear") {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (event.type === "stroke" && event.points) {
        ctx.strokeStyle = event.color || "#000000";
        ctx.lineWidth = event.width || 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();
        event.points.forEach((point, index) => {
          // Scale points to current canvas size
          const scaledX = (point.x / 100) * canvas.width;
          const scaledY = (point.y / 100) * canvas.height;

          if (index === 0) {
            ctx.moveTo(scaledX, scaledY);
          } else {
            ctx.lineTo(scaledX, scaledY);
          }
        });
        ctx.stroke();
      }
    });
  }, [remoteEvents]);

  // Get coordinates from mouse or touch event
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Calculate coordinates relative to canvas and normalize to percentage
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    return { x, y };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawer) return;
    e.preventDefault();

    const coords = getCoordinates(e);
    if (!coords) return;

    setIsDrawing(true);
    setCurrentPath([coords]);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isDrawer) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const coords = getCoordinates(e);
    if (!coords) return;

    setCurrentPath((prev) => [...prev, coords]);

    ctx.strokeStyle = tool === "eraser" ? "white" : currentColor;
    ctx.lineWidth = tool === "eraser" ? 20 : lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    const lastPoint = currentPath[currentPath.length - 1];
    // Convert percentage back to pixels for drawing
    const lastX = (lastPoint.x / 100) * canvas.width;
    const lastY = (lastPoint.y / 100) * canvas.height;
    const currentX = (coords.x / 100) * canvas.width;
    const currentY = (coords.y / 100) * canvas.height;

    ctx.moveTo(lastX, lastY);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;

    setIsDrawing(false);

    if (currentPath.length > 0 && onDrawingEvent) {
      onDrawingEvent({
        type: "stroke",
        color: tool === "eraser" ? "white" : currentColor,
        width: tool === "eraser" ? 20 : lineWidth,
        points: currentPath, // Already in percentage
      });
    }

    setCurrentPath([]);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (onDrawingEvent) {
      onDrawingEvent({ type: "clear" });
    }
  };

  return (
    <div className="space-y-4">
      {isDrawer && (
        <div className="flex flex-wrap items-center gap-3 p-4 bg-game-toolbar rounded-lg shadow-game">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={tool === "pen" ? "default" : "outline"}
              onClick={() => setTool("pen")}
              className="transition-smooth"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={tool === "eraser" ? "default" : "outline"}
              onClick={() => setTool("eraser")}
              className="transition-smooth"
            >
              <Eraser className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex gap-2 items-center">
            <Palette className="h-4 w-4 text-primary-foreground" />
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => {
                  setCurrentColor(color);
                  setTool("pen");
                }}
                className={`w-8 h-8 rounded-full border-2 transition-smooth ${currentColor === color && tool === "pen"
                    ? "border-game-active scale-110"
                    : "border-border hover:scale-105"
                  }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          <Button
            size="sm"
            variant="destructive"
            onClick={clearCanvas}
            className="ml-auto"
          >
            Clear
          </Button>
        </div>
      )}

      <div className="relative rounded-lg overflow-hidden shadow-game border-4 border-game-toolbar">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          onTouchCancel={stopDrawing}
          className="w-full bg-game-canvas aspect-video cursor-crosshair"
          style={{ touchAction: "none" }}
        />
        {!isDrawer && (
          <div className="absolute top-4 right-4 bg-muted/90 px-3 py-1 rounded-full text-sm font-medium">
            Watching
          </div>
        )}
      </div>
    </div>
  );
};

export default DrawingCanvas;
