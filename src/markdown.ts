import type { JSONContent } from '@tiptap/core'
import type { Code, Definition, Heading, Image, ImageReference, InlineCode, Link, List, Node, Nodes, Parent, Text } from 'mdast'
import { remove } from 'unist-util-remove'
import { visit } from 'unist-util-visit'
import { parse } from './unified'

export interface Rule {
  type: 'node' | 'mark'
  mdastTypes: Nodes['type'][]
  parse?: (node: Node, process: MarkdownProcess) => JSONContent | JSONContent[]
  serialize?: () => string
}

export type Rules = Record<string, Rule>

export const TIPTAP_RULES: Rules = {
  doc: {
    type: 'node',
    mdastTypes: ['root'],
  },
  paragraph: {
    type: 'node',
    mdastTypes: ['paragraph'],
  },
  blockquote: {
    type: 'node',
    mdastTypes: ['blockquote'],
  },
  horizontalRule: {
    type: 'node',
    mdastTypes: ['thematicBreak'],
  },
  heading: {
    type: 'node',
    mdastTypes: ['heading'],
    parse: (node, process) => {
      const { depth, children } = node as Heading

      return ({
        type: 'heading',
        attrs: {
          level: depth,
        },
        content: children.map(child => parseNode(child, process)),
      })
    },
  },
  codeBlock: {
    type: 'node',
    mdastTypes: ['code'],
    parse: (node) => {
      const { lang, value } = node as Code

      return ({
        type: 'heading',
        attrs: {
          language: lang,
        },
        content: [
          {
            type: 'text',
            text: value,
          },
        ],
      })
    },
  },
  list: {
    type: 'node',
    mdastTypes: ['list'],
    parse: (node, process) => {
      const { ordered, children } = node as List

      return ({
        type: ordered ? 'orderedList' : 'bulletList',
        content: children.map(child => parseNode(child, process)),
      })
    },
  },
  listItem: {
    type: 'node',
    mdastTypes: ['listItem'],
  },
  text: {
    type: 'node',
    mdastTypes: ['text'],
    parse: (node) => {
      return ({
        type: 'text',
        text: (node as Text).value,
      })
    },
  },
  image: {
    type: 'node',
    mdastTypes: ['image'],
    parse: (node) => {
      const { title, alt, url } = node as Image

      return ({
        type: 'image',
        attrs: {
          title,
          alt,
          src: url,
        },
      })
    },
  },
  imageReference: {
    type: 'node',
    mdastTypes: ['imageReference'],
    parse: (node, process) => {
      const { identifier, label, alt } = node as ImageReference

      return ({
        type: 'image',
        attrs: {
          title: label,
          alt,
          src: process.sources.get(identifier)?.url,
        },
      })
    },
  },
  hardBreak: {
    type: 'node',
    mdastTypes: ['break'],
  },
  table: {
    type: 'node',
    mdastTypes: ['table'],
  },
  tableRow: {
    type: 'node',
    mdastTypes: ['tableRow'],
  },
  tableCell: {
    type: 'node',
    mdastTypes: ['tableCell'],
  },

  link: {
    type: 'mark',
    mdastTypes: ['link'],
    parse: (node, process) => {
      const { url, children } = node as Link
      const content = parseNode(children[0], process)

      return ({
        ...content,
        marks: [{ type: 'link', attrs: { href: url } }, ...(content.marks ?? [])],
      })
    },
  },
  italic: {
    type: 'mark',
    mdastTypes: ['emphasis'],
  },
  strong: {
    type: 'mark',
    mdastTypes: ['strong'],
  },
  code: {
    type: 'mark',
    mdastTypes: ['inlineCode'],
    parse(node) {
      const { value } = node as InlineCode

      return {
        type: 'text',
        text: value,
        marks: [{ type: 'code' }],
      }
    },
  },
  strike: {
    type: 'mark',
    mdastTypes: ['delete'],
  },
}

export interface MarkdownProcessOptions {
  ignores?: Nodes['type'][]
}

export class MarkdownProcess {
  options: MarkdownProcessOptions = {
    ignores: ['footnoteDefinition', 'footnoteReference', 'definition', 'linkReference'],
  }

  rules: Rules = TIPTAP_RULES

  sources: Map<string, Definition> = new Map()

  constructor(options?: MarkdownProcessOptions) {
    this.init(options ?? {})
  }

  private init(options: MarkdownProcessOptions) {
    if (options.ignores?.length) {
      this.options.ignores = [...options.ignores]
    }
  }

  addRule(ruleKey: string, rule: Rule) {
    this.rules[ruleKey] = rule
  }

  removeRule(ruleKey: string) {
    delete this.rules[ruleKey]
  }

  parse(md: string) {
    const mdast = parse(md)

    this.sources.clear()
    visit(mdast, 'definition', (node: Definition) => {
      this.sources.set(node.identifier, node)
    })

    remove(mdast, this.options.ignores)

    return parseNode(mdast, this)
  }
}

export function parseNode(node: Node, process: MarkdownProcess): JSONContent {
  const ruleMap = Object.entries(process.rules).find(([_, rule]) => rule?.mdastTypes.includes(node.type as Nodes['type']))
  if (!ruleMap) {
    throw new Error(`Can't find the rule for node: "${node?.type}" with ${JSON.stringify(node)}`)
  }

  const [name, rule] = ruleMap

  if (rule!.parse) {
    return rule!.parse(node, process)
  }

  if (rule!.type === 'mark') {
    const content = parseNode((node as Parent).children?.[0], process)

    return ({
      ...content,
      marks: [{ type: name }, ...(content.marks ?? [])],
    })
  }

  const content = (node as Parent)?.children?.map(child => parseNode(child, process)) ?? []

  if (!content.length) {
    return {
      type: name,
    }
  }

  return ({
    type: name,
    content,
  })
}
