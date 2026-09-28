const AXES = ['x', 'y', 'z'];

export function evaluate(statements) {
  const environment = new Map();
  const effects = [];

  const component = (value, axis) => {
    if (value?.vector) return value.vector[axis];
    if (value?.symbol) return { symbol: `${value.symbol}.${AXES[axis]}` };
    return { unknown: true };
  };

  const assignOutputs = (targets, value) => {
    targets.forEach((target, axis) => {
      if (target?.kind === 'variable') environment.set(target.name, component(value, axis));
    });
  };

  const valueOf = (node) => {
    switch (node.kind) {
      case 'variable':
        return environment.has(node.name) ? environment.get(node.name) : { symbol: node.name };
      case 'number':
        return { number: node.value };
      case 'string':
      case 'name':
      case 'text':
        return { string: node.value };
      case 'true':
        return { boolean: true };
      case 'false':
        return { boolean: false };
      case 'zero':
        return { number: 0 };
      case 'one':
        return { number: 1 };
      case 'call':
        return call(node);
      case 'context':
        return context(node);
      case 'member': {
        const object = valueOf(node.object);
        return object?.fields?.[node.property] ?? { unknown: true };
      }
      case 'switch':
        return { switch: node.cases.map((entry) => valueOf(entry.value)) };
      default:
        return { unknown: true, kind: node.kind };
    }
  };

  const call = (node) => {
    const args = node.arguments;
    switch (node.function) {
      case 'MakeVector2D':
        return { vector: [valueOf(args[0]), valueOf(args[1])] };
      case 'MakeVector':
        return { vector: [valueOf(args[0]), valueOf(args[1]), valueOf(args[2])] };
      case 'BreakVector2D':
        assignOutputs(args.slice(1, 3), valueOf(args[0]));
        return null;
      case 'BreakVector':
        assignOutputs(args.slice(1, 4), valueOf(args[0]));
        return null;
      case 'MapRangeUnclamped':
        return {
          mapRange: {
            value: valueOf(args[0]),
            inA: valueOf(args[1]),
            inB: valueOf(args[2]),
            outA: valueOf(args[3]),
            outB: valueOf(args[4])
          }
        };
      case 'Subtract_DoubleDouble':
        return { subtract: [valueOf(args[0]), valueOf(args[1])] };
      case 'Conv_DoubleToText':
        return {
          toText: valueOf(args[0]),
          rounding: valueOf(args[1]).number,
          minimumFractionalDigits: valueOf(args[6]).number,
          maximumFractionalDigits: valueOf(args[7]).number
        };
      case 'Format':
        return { format: valueOf(args[0]).string, arguments: valueOf(args[1]) };
      default: {
        const outputs = args.filter((arg) => arg.kind === 'variable');
        for (const output of outputs) {
          if (!environment.has(output.name)) {
            environment.set(output.name, { symbol: `${node.function}` });
          }
        }
        return { call: node.function, arguments: args.map(valueOf) };
      }
    }
  };

  const context = (node) => {
    const member = node.member;
    if (member.kind === 'call') {
      if (member.function === 'SetText') {
        effects.push({ effect: 'SetText', value: valueOf(member.arguments[0]) });
        return null;
      }
      for (const argument of member.arguments) {
        if (argument.kind === 'variable') {
          environment.set(argument.name, { symbol: member.function });
        }
      }
      return { call: member.function };
    }
    return { unknown: true };
  };

  for (const statement of statements) {
    if (statement.kind === 'let') {
      const value = valueOf(statement.value);
      if (statement.target.kind === 'variable') {
        environment.set(statement.target.name, value);
      } else if (
        statement.target.kind === 'member' &&
        statement.target.object.kind === 'variable'
      ) {
        const name = statement.target.object.name;
        const current = environment.get(name)?.fields ?? {};
        environment.set(name, { fields: { ...current, [statement.target.property]: value } });
      }
    } else if (statement.kind === 'setArray' && statement.array.kind === 'variable') {
      environment.set(statement.array.name, { list: statement.items.map(valueOf) });
    } else if (statement.kind === 'call') {
      call(statement);
    } else if (statement.kind === 'context') {
      context(statement);
    }
  }
  return { environment, effects };
}
