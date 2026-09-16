# Interface terminology

Audience: everyday users cleaning AI-generated images for personal use. Voice: direct, practical, and clear about results.

| English | Simplified Chinese | Meaning |
| --- | --- | --- |
| Analyze | 分析 | Read metadata and scan for a visible Gemini sparkle mark. |
| Process | 处理 | Apply image changes and attempt to remove detected Gemini marks. Completion does not prove watermark removal. |
| Check output | 检查输出 | Scan the generated JPEG for metadata and visible Gemini marks. |
| AI origin clues | AI 来源线索 | Local evidence from metadata and visible marks; not proof of authorship. |
| Analysis incomplete | 分析未完成 | Checks are missing or partial. Without positive evidence, show no percentage or meter; never describe this as a completed negative scan. |
| Metadata | 元数据 | Information stored in the image file. Explain this at first use. |
| Gemini watermark | Gemini 水印 | The supported Gemini / Nano Banana sparkle mark, not every visible watermark. |
| Hidden watermark | 隐形水印 | A possible signal in image pixels whose removal this tool cannot confirm. |
| Processed JPEG | 处理后的 JPEG | Compressed output that may lose detail. |
| Start over | 重新开始 | Clear the current workflow and return to image selection. |

Keep internal translation keys and processing status enums stable. User-facing copy must not turn `neutralized-unverified` into a claim of successful removal or describe output checks as proof of a watermark-free image.

Privacy copy concerns image uploads: images stay in the browser. Do not promise that no data leaves the device; configured analytics sends usage and error events.
