import { getSourceFileOfNode, Node, forEachChild } from "./_namespaces/ts";

const maps: any = {};
const nodePaths = new WeakMap<Node, string>();

let stopRecord = 0;

export default function <T extends Node, K>(event: string, node: T, fn: (node: T) => K): K {
    let resolved: any = loadCache(event, node);
    if (!resolved) {
        proxyNode(node);
        const accessRecord: any = {};
        ((node as any).__records__ as Set<any>).add(accessRecord);
        resolved = fn(node);
        ((node as any).__records__ as Set<any>).delete(accessRecord);
        setCache(event, node, accessRecord, resolved);
    }
    return resolved;
}

function loadCache(event: string, node: Node) {
    const cacheMap = getCacheMap(event, node);
    const cache = cacheMap.get(getNodePath(node));
    stopRecord++;
    if (cache && isSame(cache.node, node, cache.record)) {
        stopRecord--;
        return cache.result;
    }
    stopRecord--;
}

function setCache(event: string, node: Node, record: any, result: any) {
    const cacheMap = getCacheMap(event, node);
    cacheMap.set(getNodePath(node), {
        node,
        result,
        record,
    });
}

function getNodePath(node: Node): string {
    if (!nodePaths.has(node)) {
        const path: string[] = [];
        let current = node;
        while (current.parent) {
            let i = 0;
            let index = -1;
            forEachChild(current.parent, (child) => {
                if (index !== -1) {
                    return;
                }
                if (child === current) {
                    index = i;
                }
                if (child.kind === current.kind) {
                    i++;
                }
            });
            path.push(current.kind + "_" + index);
            current = current.parent;
        }
        nodePaths.set(node, path.reverse().join("/"));
    }
    return nodePaths.get(node)!;
}

function getCacheMap(event: string, node: Node): Map<string, { node: Node, record: any, result: any }> {
    const sourceFile = getSourceFileOfNode(node);
    maps[event] ??= {};
    maps[event][sourceFile.path] ??= new Map();
    return maps[event][sourceFile.path];
}

function isSame(oldObj: any, newObj: any, keys: any) {
    for (const key in keys) {
        if (typeof newObj[key] !== typeof oldObj[key]) {
            // console.log("type not match", key, newObj[key], oldNode[key]);
            return false;
        }
        if (keys[key] === true) {
            if (newObj[key] !== oldObj[key]) {
                // console.log("value not match", key, newObj[key], oldNode[key]);
                return false;
            }
        }
        else if (typeof oldObj[key] === "object") {
            if (!isSame(newObj[key], oldObj[key], keys[key])) {
                return false;
            }
        }
    }
    return true;
}

function proxyNode<T extends Node>(node: T, records = new Set<any>(), parentProps: string[] = []) {
    if ((node as any)["__records__"]) {
        return;
    }
    Object.defineProperty(node, "__records__", { value: records });
    for (const key in node) {
        let value: any = node[key];
        Object.defineProperty(node, key, {
            get() {
                if (typeof value === "object") {
                    proxyNode(value, records, [...parentProps, key]);
                }
                else if (typeof value === "function") {
                    // ignore
                }
                else if (!stopRecord) {
                    for (const record of records) {
                        let current = record;
                        for (const prop of parentProps) {
                            if (typeof current[prop] !== "object") {
                                current[prop] = {};
                            }
                            current = current[prop];
                        }
                        if (typeof current[key] !== "object") {
                            current[key] = {};
                        }
                        current[key as string] = true;
                    }
                }
                return value;
            },
            set(newValue) {
                value = newValue;
            },
        });
    }
}
