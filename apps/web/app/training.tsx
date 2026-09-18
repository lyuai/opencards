import { NavLink } from "react-router";
import { Brand } from "./brand";

const steps = [
  { title: "坐南家，四人一桌", body: "对家是队友，上家和下家是对方。级牌从 2 打到 A，先打过 A 的一方获胜。" },
  { title: "点选或滑动选牌", body: "同点数会叠在一起。点一下选中，再点取消；按住滑动可以连选。" },
  { title: "合法才出得了", body: "跟牌必须压过当前牌型，否则只能不出。点「提示」会轮换当前能出的组合。" },
  { title: "教练只给参考", body: "轮到你时，右侧会标出更稳妥的一手。可以照着打，也可以自己改。" },
  { title: "打完看复盘", body: "每一手会对照教练建议。压了对家、和教练不同的牌，结束之后都能点开看。" },
];

export default function TrainingPage() {
  return (
    <main className="training">
      <header>
        <Brand />
        <nav>
          <NavLink to="/">回牌桌</NavLink>
        </nav>
      </header>
      <section className="trainingIntro">
        <small>怎么打</small>
        <h1>一局完整掼蛋</h1>
        <p>不用先学规则手册。坐下之后，能出的牌会自己亮出来，教练只在你犹豫的时候说话。</p>
      </section>
      <ol className="howList">
        {steps.map((step, index) => (
          <li key={step.title}>
            <em>{index + 1}</em>
            <div>
              <b>{step.title}</b>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
