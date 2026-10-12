import { createCodeMatrixBrowserRun } from '../../src/utils/codeMatrixRuntime.js';
const smoke = document.querySelector('#smoke');
const output = document.querySelector('#output');
const status = document.querySelector('#status');
let task;
smoke.onclick=async()=>{
  smoke.disabled=true; output.textContent='';
  const scientificCase={language:'python',code:`import pandas as pd
from numpy import mean
import matplotlib.pyplot as plt
from io import BytesIO
df = pd.DataFrame({'Road': ['A', 'B', 'C', 'D', 'E'], 'Vehicles': [20, 65, 110, 45, 130], 'Speed': [60, 40, 20, 50, 15]})
print('Total:', df['Vehicles'].sum())
print('Slow roads:', ','.join(df.loc[df['Speed'] < 30, 'Road']))
print('Mean speed:', int(mean(df['Speed'])))
plt.bar(df['Road'], df['Vehicles'])
image = BytesIO()
plt.savefig(image, format='png')
plt.close()
print('Plot saved:', image.getvalue().startswith(bytes([137, 80, 78, 71])))`,expect:'Total: 370\nSlow roads: C,E\nMean speed: 37\nPlot saved: True\n'};
  const cases=[
    {name:'JavaScript input after await',language:'javascript',code:'const name=prompt("Name: ");\nawait new Promise(r=>setTimeout(r,10));\nconst n=Number(prompt("Number: "));\nconsole.log(name,n*2);',inputs:['Ada','21'],expect:'Name: Ada\nNumber: 21\nAda 42\n'},
    {name:'C scanf and EOF',language:'c',code:'#include <stdio.h>\nint main(){int n;printf("Number: ");scanf("%d",&n);printf("Double: %d\\nMore? ",n*2);printf("%s\\n",scanf("%d",&n)==EOF?"EOF":"value");}',inputs:['21',null],expect:'Number: 21\nDouble: 42\nMore? EOF\n'},
    {name:'C++ standard library',language:'cpp',code:'#include <iostream>\n#include <vector>\nint main(){int n;std::cout<<"Number: ";std::cin>>n;std::vector<int> v{n,2,3};for(auto x:v)std::cout<<x*x<<" ";}',inputs:['4'],expect:'Number: 4\n16 4 9 '},
    {name:'Java Scanner multiple inputs and EOF',language:'java',code:'import java.util.*;\npublic class Main {public static void main(String[] args){Scanner s=new Scanner(System.in);System.out.print("Name: ");String name=s.nextLine();System.out.print("Number: ");int n=s.nextInt();System.out.println(name+": "+n*2);System.out.print("More? ");System.out.println(s.hasNext()?s.next():"EOF");}}',inputs:['Ada','21',null],expect:'Name: Ada\nNumber: 21\nAda: 42\nMore? EOF\n'},
    {name:'Java compile error',language:'java',code:'public class Main {\n public static void main(String[] args) {\n int x = ;\n }}',status:'error',error:/Main\.java:3/},
    {name:'C compile error',language:'c',code:'#include <stdio.h>\nint main(){int x = ;}',status:'error',error:/main\.c:2/},
    {name:'JavaScript source error line',language:'javascript',code:'console.log("before");\nthrow new Error("expected failure");',status:'error',error:/script\.js:2/},
    {name:'Python blank input and EOF',language:'python',code:'print("Name:", input("Name: "))\nprint("Blank:", repr(input("Blank: ")))\nimport sys\nprint("EOF:",repr(sys.stdin.readline()))',inputs:['Ada','',null],expect:"Name: Ada\nName: Ada\nBlank: \nBlank: ''\nEOF: ''\n"},
    {...scientificCase,name:'Python scientific imports, traffic data and figure creation'},
    {...scientificCase,name:'Python scientific from-imports and debug trace',debug:true,code:scientificCase.code.replace('import matplotlib.pyplot as plt','from matplotlib import pyplot as plt'),check:r=>r.trace?.some(step=>step.line===5)&&r.trace?.every(step=>step.line<=13)},
    {name:'Python configuration before import is preserved',language:'python',code:'import os\nos.environ["MPLBACKEND"] = "svg"\nimport matplotlib\nprint(matplotlib.get_backend())',expect:'svg\n'},
    {name:'Python unavailable package error',language:'python',code:'import code_matrix_missing_package',status:'error',error:/ModuleNotFoundError/},
    {name:'Python missing submodule preserves output and source line',language:'python',code:'print("before")\nimport numpy.code_matrix_missing_module',expect:'before\n',status:'error',error:/File "<code-matrix>", line 2/},
    {name:'Python syntax error source line',language:'python',code:'print("before")\nvalue =',status:'error',error:/File "<code-matrix>", line 2/},
    {name:'SQL table',language:'sql',code:'SELECT 42 AS answer;',check:r=>r.tables?.[0]?.values[0][0]===42},
    {name:'Cancel while waiting',language:'javascript',code:'prompt("Waiting: ");',stopOnInput:true,status:'stopped'},
    {name:'JavaScript infinite loop deadline',language:'javascript',code:'while(true){}',status:'timeout'},
  ];
  const reports=[];
  for(const spec of cases){
    const selected = new URLSearchParams(location.search).get('language');
    if (selected && selected !== spec.language) continue;
    status.textContent=spec.name; let index=0; let prompts=[];
    task=createCodeMatrixBrowserRun({...spec,interactive:true,onEvent(e){
      if(e.type==='input-request')setTimeout(()=>{prompts.push(document.querySelector('#live').textContent);if(spec.stopOnInput)task.cancel();else task.submitInput(spec.inputs?.[index++] ?? null);},150);
      if(e.type==='output')document.querySelector('#live').textContent=e.result.stdout;
    }});
    const result=await task.promise;
    const pass=result.status===(spec.status||'success')&&(spec.expect===undefined||result.stdout===spec.expect)&&(!spec.error||spec.error.test(result.stderr))&&(!spec.check||spec.check(result));
    reports.push({name:spec.name,pass,prompts,result});output.textContent=JSON.stringify(reports,null,2);
  }
  status.textContent=reports.every(r=>r.pass)?'ALL SMOKE TESTS PASSED':'SMOKE TEST FAILED';smoke.disabled=false;
};
