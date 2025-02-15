import type { Node } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

export function parse(markdown: string): Node {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)

  const ast = processor.parse(markdown)

  return ast
}
