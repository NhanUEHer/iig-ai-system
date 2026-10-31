const assert = require('node:assert/strict');
const test = require('node:test');

const syncService = require('../src/services/syncService');

test('mapping sync follows admin-proxy pagination and stores direct keyCode-to-id mappings', async () => {
  const payloads = [];
  const pages = [
    {
      pagedData: {
        items: [
          { id: 'id-new', keyCode: '0P5K8JDL', webUserName: 'Nguyễn A', mockTestName: 'Đề 02' },
          { id: 'id-six', keyCode: 'POX8ZE', webUserName: 'Nguyễn B', name: 'Đề 03' },
        ],
        totalPages: 2,
        hasNextPage: true,
      },
    },
    {
      pagedData: {
        items: [
          { id: 'id-old', keyCode: '0P5K8JDL', webUserName: 'Tên cũ', name: 'Đề cũ' },
          { id: 'id-third', keyCode: 'ABC12345', webUserName: 'Nguyễn C', name: 'Đề 04' },
        ],
        totalPages: 2,
        hasNextPage: false,
      },
    },
  ];
  const stored = [];
  const database = {
    transaction: async work => work({
      query: async (_sql, params) => { stored.push(params); return { rows: [] }; },
    }),
  };
  const iigClient = {
    listMocktestScorings: async payload => {
      payloads.push(payload);
      return pages[payloads.length - 1];
    },
  };

  const count = await syncService.syncMappings({
    pageSize: 100,
    keyword: 'TOEIC',
    fromSubmittedDate: '2026-10-05',
    toSubmittedDate: '2026-10-06',
  }, { database, iigClient });

  assert.equal(count, 3);
  assert.deepEqual(payloads.map(payload => payload.PageNumber), [1, 2]);
  assert.equal(payloads[0].PageSize, 100);
  assert.equal(payloads[0].Keyword, 'TOEIC');
  assert.equal(payloads[0].SubmittedDateFrom, '2026-10-05');
  assert.equal(payloads[0].SubmittedDateTo, '2026-10-06');
  assert.deepEqual(stored.map(params => params.slice(0, 2)), [
    ['0P5K8JDL', 'id-new'],
    ['POX8ZE', 'id-six'],
    ['ABC12345', 'id-third'],
  ]);
});

test('mapping sync rejects malformed admin-proxy responses before writing', async () => {
  let transactionCalled = false;
  await assert.rejects(
    () => syncService.syncMappings({}, {
      iigClient: { listMocktestScorings: async () => ({ items: [] }) },
      database: { transaction: async () => { transactionCalled = true; } },
    }),
    /invalid pagedData/
  );
  assert.equal(transactionCalled, false);
});

test('online keycode resolution performs an exact keyCode match', async () => {
  const queries = [];
  const database = {
    query: async (sql, params) => {
      queries.push([sql, params]);
      return { rows: [] };
    },
  };
  const iigClient = {
    listMocktestScorings: async payload => {
      assert.equal(payload.Keyword, '0P5K8JDL');
      return { pagedData: { items: [
        { id: 'wrong-id', keyCode: 'OTHER123', name: 'Other' },
        { id: 'right-id', keyCode: '0p5k8jdl', webUserName: 'Nguyễn A', mockTestName: 'Đề 02' },
      ] } };
    },
  };

  const result = await syncService.resolveCourseScoringId('0p5k8jdl', { database, iigClient });
  assert.deepEqual(result, {
    course_scoring_id: 'right-id',
    student_name: 'Nguyễn A',
    test_name: 'Đề 02',
  });
  assert.match(queries.at(-1)[0], /INSERT INTO keycode_mappings/);
});
