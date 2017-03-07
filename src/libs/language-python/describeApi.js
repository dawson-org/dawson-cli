// == wrapper code for the python parser ==
// call the require.py script and return the resulting JSON
//

export default function (/* { rootDir } */) {
  const myfunction = {
    name: 'myfunction',
    api: {
      path: 'test',
      runtime: 'python2.7'
    }
  };
  return {
    myfunction
  };
}
