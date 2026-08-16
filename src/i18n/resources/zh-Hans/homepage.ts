export const homepage = {
  header: {
    product: "AI 水印处理工具",
    tagline: "分析、干扰并验证 AI 水印。",
    clientSide: "100% 浏览器本地处理。",
    privacy: "图片始终留在你的浏览器中。",
    private: "100% 私密",
    fast: "高速处理",
    noUploads: "无需上传",
  },
  workflowHeading: "处理流程",
  uploader: {
    title: "拖入图片",
    dragging: "在此放下图片",
    description: "将图片拖到这里以分析本地 AI 信号；支持处理时，工具会自动干扰水印。",
    defaultDescription: "拖放到这里，或点击从设备中选择文件。",
    privacy: "图片绝不会上传；所有操作均在你的浏览器本地完成。",
  },
  loading: {
    preparing: "正在准备 {{fileName}}",
    description: "正在加载本地图像处理流程……",
  },
  facts: {
    eyebrow: "核心信息",
    heading: "在浏览器本地分析并干扰 AI 水印，无需上传图片。",
    introduction:
      "Unmarker.it 是一款隐私优先的浏览器工具，用于干扰图片中的隐形 AI 水印信号。无需上传、无需服务器处理，数据不会离开你的设备。工具基于计算机视觉研究中的对抗性干扰方法，在浏览器内对图像施加有针对性的细微变化，破坏机器可读的水印模式，同时尽量保持视觉质量。",
    browser: {
      title: "图片留在浏览器中",
      body: "Unmarker.it 使用 Canvas API 在本地处理浏览器可解码的图片，不设图片上传接口、服务端处理端点或账户要求。",
    },
    workflow: {
      title: "分析、干扰、验证",
      body: "只需选择一次图片：Unmarker.it 会扫描元数据和可见标记，在可处理时运行本地水印干扰流程，并再次检查生成的 JPEG。",
    },
    formats: {
      title: "支持的文件与输出",
      body: "处理支持浏览器可读取、最高 4000 万像素且不超过 25 MB 的图片。仅分析模式支持 PNG、JPEG、WebP、AVIF、HEIF 和 JXL 元数据。",
    },
    responsible: {
      title: "用于可信测试",
      body: "结果取决于水印方法、检测器、输入图片、压缩级别和后续使用方式。本工具适用于隐私研究、鲁棒性测试、个人媒体工作流与教学。",
    },
  },
} as const;
