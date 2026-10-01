export type Node =
  | LiteralNode
  | IdentifierNode
  | TemplateNode
  | ArrayNode
  | ObjectNode
  | MemberNode
  | CallNode
  | UnaryNode
  | BinaryNode
  | LogicalNode
  | ConditionalNode
  | ArrowNode;

export interface LiteralNode {
  type: 'Literal';
  value: string | number | boolean | null | undefined;
}

export interface IdentifierNode {
  type: 'Identifier';
  name: string;
}

export interface TemplateNode {
  type: 'Template';
  /** Literal chunks; always one more than `expressions`. */
  quasis: string[];
  expressions: Node[];
}

export interface ArrayNode {
  type: 'Array';
  elements: Node[];
}

export interface ObjectNode {
  type: 'Object';
  properties: { key: string; value: Node }[];
}

export interface MemberNode {
  type: 'Member';
  object: Node;
  /** Identifier properties are stored as string literals. */
  property: Node;
  computed: boolean;
  optional: boolean;
}

export interface CallNode {
  type: 'Call';
  callee: Node;
  args: Node[];
  optional: boolean;
}

export type UnaryOperator = '!' | '-' | '+' | 'typeof';

export interface UnaryNode {
  type: 'Unary';
  operator: UnaryOperator;
  argument: Node;
}

export type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '**'
  | '=='
  | '!='
  | '==='
  | '!=='
  | '<'
  | '<='
  | '>'
  | '>=';

export interface BinaryNode {
  type: 'Binary';
  operator: BinaryOperator;
  left: Node;
  right: Node;
}

export interface LogicalNode {
  type: 'Logical';
  operator: '&&' | '||' | '??';
  left: Node;
  right: Node;
}

export interface ConditionalNode {
  type: 'Conditional';
  test: Node;
  consequent: Node;
  alternate: Node;
}

export interface ArrowNode {
  type: 'Arrow';
  params: string[];
  body: Node;
}
