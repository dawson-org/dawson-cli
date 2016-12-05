
import chalk from 'chalk';
import indent from 'indent-string';
import { oneLine, stripIndent } from 'common-tags';

export default function createError ({
  kind = '',
  reason = '',
  detailedReason = '',
  solution = ''
}) {
  const err = new Error();
  err.isDawsonError = true;
  err.toFormattedString = function dawsonErrorToString () {
    const errorTitle = chalk.bgRed.bold('Execution Error');
    const reasonTitle = reason ? chalk.red.bold('Possible cause') : '';
    const solutionTitle = solution ? chalk.green.bold('Possible solution') : '';
    const footer = chalk.gray(oneLine`
      If you believe this is not an expected behaviour or that
      this error message should be improved, open an issue: https://github.com/dawson-org/dawson-cli/issues
    `);

    const msg = '\n' + stripIndent`

${errorTitle} 
${chalk.red.bold(kind)}

${reasonTitle}
${chalk.red(reason)}

${detailedReason}

${solutionTitle}
${solution}
    `.trim().replace(/\n\n\n/g, '\n') + '\n\n' + footer;
    return indent(msg, 3);
  };
  return err;
}
