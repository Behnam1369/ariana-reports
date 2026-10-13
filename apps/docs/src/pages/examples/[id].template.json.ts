import type { APIRoute, GetStaticPaths } from 'astro';
import { examples } from '../../demos/data';

export const getStaticPaths = (() => examples.map((e) => ({ params: { id: e.id }, props: { template: e.template } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(props.template, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
