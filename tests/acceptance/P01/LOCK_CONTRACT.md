# 验收工作区互斥锁回归

运行：在仓库根目录执行 `node --test tests/support/acceptance-lock.test.cjs`。

测试使用后端已安装的 TypeScript 编译器在内存中转换并加载真实 `tests/support/acceptance-lock.ts`，没有复制锁实现。每个文件系统用例创建随机系统临时目录，只清理自己创建且检查过父目录与前缀的目录，不接触真实 `artifacts/acceptance/.workspace.lock`。

覆盖：正常返回及异常后的释放；已有锁不覆盖且不执行 action；同进程竞争；两个独立进程同步开始时恰好一个 action 执行；进程崩溃后遗留锁不自动抢占；锁内容被其他所有者替换时保留替换文件并报错。另通过 TypeScript AST 检查 P00/P01/P02 的真实入口调用一次互斥锁，P01/P02 路由分支不重复获取锁。

边界：这是验收运行器的文件锁合同测试，不证明 Windows Prisma DLL 自身的行为，也不证明整个 P01 已完成。遗留锁必须由操作者确认所有 stage 子进程退出后手动清除，测试禁止自动通过超时或 PID 判断抢占锁。
