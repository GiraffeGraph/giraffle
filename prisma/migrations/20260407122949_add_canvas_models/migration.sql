-- CreateTable
CREATE TABLE "Canvas" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled Canvas',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Canvas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasNode" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "noteId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'note',
    "data" JSONB NOT NULL DEFAULT '{}',
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 300,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "color" TEXT,

    CONSTRAINT "CanvasNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasEdge" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "sourceHandle" TEXT,
    "targetHandle" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "type" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "CanvasEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Canvas_userId_idx" ON "Canvas"("userId");

-- CreateIndex
CREATE INDEX "CanvasNode_canvasId_idx" ON "CanvasNode"("canvasId");

-- CreateIndex
CREATE INDEX "CanvasNode_noteId_idx" ON "CanvasNode"("noteId");

-- CreateIndex
CREATE INDEX "CanvasEdge_canvasId_idx" ON "CanvasEdge"("canvasId");

-- CreateIndex
CREATE INDEX "CanvasEdge_sourceNodeId_idx" ON "CanvasEdge"("sourceNodeId");

-- CreateIndex
CREATE INDEX "CanvasEdge_targetNodeId_idx" ON "CanvasEdge"("targetNodeId");

-- AddForeignKey
ALTER TABLE "Canvas" ADD CONSTRAINT "Canvas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasNode" ADD CONSTRAINT "CanvasNode_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "Canvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasNode" ADD CONSTRAINT "CanvasNode_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasEdge" ADD CONSTRAINT "CanvasEdge_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "Canvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
