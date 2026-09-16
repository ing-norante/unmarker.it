export const homepage = {
  header: {
    product: "AI 水印处理工具",
    tagline: "分析图片、处理水印、检查结果。",
    clientSide: "在浏览器中处理。",
    privacy: "图片始终留在你的浏览器中。",
    private: "图片本地处理",
    fast: "无需账户",
    noUploads: "无需上传图片",
  },
  workflowHeading: "处理流程",
  uploader: {
    title: "添加图片",
    dragging: "在此放下图片",
    description: "选择或拖入图片，工具会先分析图片，并在支持时自动开始处理。",
    defaultDescription: "拖放到这里，或点击从设备中选择文件。",
    privacy: "图片在此浏览器中处理，不会上传。",
  },
  loading: {
    preparing: "正在准备 {{fileName}}",
    description: "正在加载图片工具……",
  },
  loadError: {
    title: "无法加载图片工具",
    description: "请检查网络连接并重新加载页面。网站更新后可能出现此问题。",
    action: "重新加载",
  },
  facts: {
    eyebrow: "核心信息",
    heading: "无需上传图片，即可处理 AI 水印。",
    introduction:
      "Unmarker.it 检查图片中的 AI 线索，尝试移除可见的 Gemini / Nano Banana 闪光标记，并通过图像处理尝试干扰隐形水印。本工具无法确认隐形水印是否已移除。",
    browser: {
      title: "图片留在浏览器中",
      body: "图片分析与处理均在浏览器中完成，无需账户，也无需上传图片。启用统计功能时，网站会发送使用情况和错误事件。",
    },
    workflow: {
      title: "分析、处理、检查",
      body: "只需选择一次图片。工具会读取元数据（保存在文件中的信息）、检查 Gemini 闪光标记、处理支持的图片，然后再次检查生成的 JPEG。",
    },
    formats: {
      title: "支持的文件与输出",
      body: "可处理浏览器能读取、最高 4000 万像素且不超过 25 MB 的图片。输出为压缩 JPEG，可能损失细节。无法处理图片时，PNG、JPEG、WebP、AVIF、HEIF 和 JXL 仍支持元数据分析。",
    },
    responsible: {
      title: "使用前检查结果",
      body: "下载前请对比原图与处理后的图片。效果因图片和水印方法而异；处理完成不代表水印一定已移除或无法被检测。",
    },
  },
} as const;
