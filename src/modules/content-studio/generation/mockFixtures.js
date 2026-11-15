'use strict';

// Curated sample output for the HF Manufacturers letter used in Content Studio demos.
// The mock provider returns these when the input matches, so the UI shows realistic content
// without calling any AI service.

const TRANSLATIONS = {
  'I am writing in reference to the partnership proposal that you sent to HF Manufacturers on 8 March.':
    'Tôi viết thư này liên quan đến bản đề xuất hợp tác mà bà đã gửi cho HF Manufacturers vào ngày 8 tháng 3.',
  'I am pleased to inform you that our Vice President, Mr. Howard, would like to meet with representatives from your company to discuss the proposal in more detail.':
    'Tôi vui mừng thông báo rằng Phó Chủ tịch của chúng tôi, ông Howard, muốn gặp đại diện công ty bà để thảo luận chi tiết hơn về bản đề xuất.',
  'Mr. Howard will be away on business until 18 March, so he suggests holding the meeting on 20 March at 10:00 A.M. in our head office.':
    'Ông Howard sẽ đi công tác đến ngày 18 tháng 3, vì vậy ông đề nghị tổ chức cuộc họp vào ngày 20 tháng 3 lúc 10:00 sáng tại trụ sở chính của chúng tôi.',
  'If this date does not suit you, please let us know two or three alternative dates and we will do our best to accommodate them.':
    'Nếu ngày này không phù hợp với bà, vui lòng cho chúng tôi biết hai hoặc ba ngày khác và chúng tôi sẽ cố gắng hết sức để sắp xếp.',
  'Because this meeting is crucial to our first cooperation, our finance advisor, Ms. Lee, will also attend.':
    'Vì cuộc họp này rất quan trọng đối với lần hợp tác đầu tiên của chúng ta, cố vấn tài chính của chúng tôi, bà Lee, cũng sẽ tham dự.',
  'We would appreciate it if you could bring the cost estimates and the delivery schedule mentioned in your proposal.':
    'Chúng tôi sẽ rất cảm kích nếu bà có thể mang theo bảng ước tính chi phí và lịch giao hàng đã nêu trong bản đề xuất.',
  'All other necessary paperwork will be prepared by our legal team.':
    'Tất cả các giấy tờ cần thiết khác sẽ do bộ phận pháp lý của chúng tôi chuẩn bị.',
  'Please confirm your attendance by replying to this letter or by calling my office at 555-0142 before 15 March.':
    'Vui lòng xác nhận việc tham dự bằng cách trả lời thư này hoặc gọi đến văn phòng của tôi theo số 555-0142 trước ngày 15 tháng 3.',
};

const VOCAB = [
  { inText: 'in reference to', lemma: 'in reference to', pos: 'Prepositional Phrase', ipa: '/ɪn ˈrefrəns tuː/', meaningVi: 'liên quan đến' },
  { inText: 'proposal', lemma: 'proposal', pos: 'Noun', ipa: '/prəˈpəʊzl/', meaningVi: 'bản đề xuất' },
  { inText: 'Vice President', lemma: 'vice president', pos: 'Noun Phrase', ipa: '/ˌvaɪs ˈprezɪdənt/', meaningVi: 'phó chủ tịch' },
  { inText: 'representatives', lemma: 'representative', pos: 'Noun', ipa: '/ˌreprɪˈzentətɪv/', meaningVi: 'người đại diện' },
  { inText: 'away on business', lemma: 'be away on business', pos: 'Phrase', ipa: '/əˈweɪ ɒn ˈbɪznəs/', meaningVi: 'đi công tác' },
  { inText: 'suit', lemma: 'suit', pos: 'Verb', ipa: '/suːt/', meaningVi: 'phù hợp, thuận tiện' },
  { inText: 'alternative', lemma: 'alternative', pos: 'Adjective', ipa: '/ɔːlˈtɜːnətɪv/', meaningVi: 'thay thế, khác' },
  { inText: 'accommodate', lemma: 'accommodate', pos: 'Verb', ipa: '/əˈkɒmədeɪt/', meaningVi: 'đáp ứng, sắp xếp cho phù hợp' },
  { inText: 'crucial', lemma: 'crucial', pos: 'Adjective', ipa: '/ˈkruːʃl/', meaningVi: 'cực kỳ quan trọng' },
  { inText: 'cost estimates', lemma: 'cost estimate', pos: 'Noun Phrase', ipa: '/kɒst ˈestɪmət/', meaningVi: 'bảng ước tính chi phí' },
  { inText: 'delivery schedule', lemma: 'delivery schedule', pos: 'Noun Phrase', ipa: '/dɪˈlɪvəri ˈʃedjuːl/', meaningVi: 'lịch giao hàng' },
  { inText: 'paperwork', lemma: 'paperwork', pos: 'Noun', ipa: '/ˈpeɪpəwɜːk/', meaningVi: 'giấy tờ, thủ tục' },
];

const entry = (inText, lemma, pos, ipa, meaningVi, meaningEn, context, exampleEn, exampleVi, extra = {}) => ({
  inText, lemma, pos, ipa, meaningVi, meaningEn, context, example: { en: exampleEn, vi: exampleVi },
  collocations: extra.collocations || [], synonyms: extra.synonyms || [], wordFamily: extra.wordFamily || [],
});

const DICTIONARY = [
  [
    entry('in reference to', 'in reference to', 'Prepositional Phrase', '/ɪn ˈrefrəns tuː/', 'liên quan đến', 'About or concerning something.', 'Mở đầu thư để nêu chủ đề: thư này nói về bản đề xuất đã gửi trước đó.', 'I am calling in reference to your job application.', 'Tôi gọi điện liên quan đến đơn xin việc của bạn.', { synonyms: ['regarding', 'concerning'] }),
    entry('proposal', 'proposal', 'Noun', '/prəˈpəʊzl/', 'bản đề xuất', 'A formal plan or suggestion put forward for consideration.', '“proposal” chỉ bản đề xuất hợp tác mà bà Joseph đã gửi cho công ty.', 'The board approved the proposal for a new branch office.', 'Hội đồng quản trị đã phê duyệt đề xuất mở văn phòng chi nhánh mới.', { collocations: ['submit a proposal', 'business proposal'], wordFamily: ['propose (v)', 'proposal (n)'] }),
  ],
  [
    entry('Vice President', 'vice president', 'Noun Phrase', '/ˌvaɪs ˈprezɪdənt/', 'phó chủ tịch', 'A person next in rank below a president.', 'Chức danh của ông Howard — người muốn gặp đại diện công ty đối tác.', 'The vice president will lead the meeting.', 'Phó chủ tịch sẽ chủ trì cuộc họp.'),
    entry('representatives', 'representative', 'Noun', '/ˌreprɪˈzentətɪv/', 'người đại diện', 'A person chosen to act or speak for others.', 'Những người thay mặt công ty bà Joseph đến dự họp.', 'Two representatives from the bank visited our office.', 'Hai người đại diện ngân hàng đã đến văn phòng chúng tôi.', { wordFamily: ['represent (v)', 'representation (n)'] }),
  ],
  [
    entry('away on business', 'be away on business', 'Phrase', '/əˈweɪ ɒn ˈbɪznəs/', 'đi công tác', 'Travelling for work and not in the office.', 'Lý do ông Howard không thể họp trước ngày 18/3.', 'The manager is away on business this week.', 'Quản lý đi công tác tuần này.'),
    entry('head office', 'head office', 'Noun Phrase', '/ˌhed ˈɒfɪs/', 'trụ sở chính', 'The main office of a company.', 'Địa điểm tổ chức cuộc họp.', 'All invoices are processed at the head office.', 'Mọi hoá đơn được xử lý tại trụ sở chính.', { synonyms: ['headquarters'] }),
  ],
  [
    entry('suit', 'suit', 'Verb', '/suːt/', 'phù hợp, thuận tiện', 'To be convenient or acceptable for someone.', 'Hỏi xem ngày 20/3 có thuận tiện cho bà Joseph hay không.', 'Does Friday suit you for the interview?', 'Thứ Sáu có thuận tiện cho bạn để phỏng vấn không?'),
    entry('accommodate', 'accommodate', 'Verb', '/əˈkɒmədeɪt/', 'đáp ứng, sắp xếp cho phù hợp', 'To provide what someone needs or wants.', 'Công ty sẽ cố gắng sắp xếp theo ngày khác mà bà Joseph đề xuất.', 'The hotel can accommodate special requests.', 'Khách sạn có thể đáp ứng các yêu cầu đặc biệt.', { wordFamily: ['accommodation (n)'] }),
  ],
  [
    entry('crucial', 'crucial', 'Adjective', '/ˈkruːʃl/', 'cực kỳ quan trọng', 'Extremely important or necessary.', 'Nhấn mạnh tầm quan trọng của cuộc họp đối với lần hợp tác đầu tiên.', 'Good communication is crucial to success.', 'Giao tiếp tốt là yếu tố then chốt để thành công.', { synonyms: ['essential', 'vital'] }),
  ],
  [
    entry('cost estimates', 'cost estimate', 'Noun Phrase', '/kɒst ˈestɪmət/', 'bảng ước tính chi phí', 'A calculation of the likely cost of something.', 'Một trong hai tài liệu bà Joseph được đề nghị mang theo.', 'Please send us a cost estimate by Monday.', 'Vui lòng gửi chúng tôi bảng ước tính chi phí trước thứ Hai.'),
    entry('delivery schedule', 'delivery schedule', 'Noun Phrase', '/dɪˈlɪvəri ˈʃedjuːl/', 'lịch giao hàng', 'A plan showing when goods will be delivered.', 'Tài liệu thứ hai cần mang theo, đã nêu trong bản đề xuất.', 'The supplier changed the delivery schedule.', 'Nhà cung cấp đã thay đổi lịch giao hàng.'),
  ],
  [
    entry('paperwork', 'paperwork', 'Noun', '/ˈpeɪpəwɜːk/', 'giấy tờ, thủ tục', 'Documents needed for a piece of business.', 'Các giấy tờ khác sẽ do bộ phận pháp lý chuẩn bị.', 'We finished the paperwork for the new contract.', 'Chúng tôi đã hoàn tất giấy tờ cho hợp đồng mới.'),
  ],
  [
    entry('confirm', 'confirm', 'Verb', '/kənˈfɜːm/', 'xác nhận', 'To say that something is definitely true or will happen.', 'Đề nghị bà Joseph xác nhận sẽ tham dự cuộc họp.', 'Please confirm your booking by email.', 'Vui lòng xác nhận đặt chỗ qua email.', { wordFamily: ['confirmation (n)'] }),
    entry('attendance', 'attendance', 'Noun', '/əˈtendəns/', 'sự tham dự', 'The fact of being present at an event.', 'Việc bà Joseph có mặt tại cuộc họp.', 'Attendance at the training is required.', 'Bắt buộc tham dự buổi đào tạo.', { wordFamily: ['attend (v)', 'attendee (n)'] }),
  ],
];

const QUESTIONS = {
  'What is the purpose of the letter?': {
    translation: { stem: 'Mục đích của bức thư là gì?', options: { A: 'Yêu cầu chi tiết về một bản đề xuất', B: 'Sắp xếp một cuộc họp công việc', C: 'Yêu cầu một bản đề xuất kinh doanh mới', D: 'Ký một thỏa thuận hợp tác' } },
    hint: 'Câu hỏi về mục đích thường được trả lời ở đoạn đầu thư. Hãy đọc kỹ điều người viết muốn làm sau khi nhắc đến bản đề xuất.',
    explanation: 'Đáp án đúng là (B) To arrange a business meeting. Đoạn đầu viết: “Mr. Howard, would like to meet with representatives from your company to discuss the proposal in more detail”, và cả bức thư bàn về thời gian, người tham dự và tài liệu cho cuộc họp. (A) sai vì công ty không hỏi thêm chi tiết mà mời gặp để thảo luận. (C) sai vì bản đề xuất đã được gửi từ trước. (D) sai vì thư chưa nhắc đến việc ký thỏa thuận.',
    note: 'Thí sinh dễ chọn phương án có từ “proposal” vì từ này xuất hiện nhiều lần, nhưng mục đích chính của thư là sắp xếp cuộc họp.',
  },
  'When does Mr. Howard suggest holding the meeting?': {
    translation: { stem: 'Ông Howard đề nghị tổ chức cuộc họp vào khi nào?', options: { A: 'Vào ngày 8 tháng 3', B: 'Vào ngày 15 tháng 3', C: 'Vào ngày 18 tháng 3', D: 'Vào ngày 20 tháng 3' } },
    hint: 'Bài có nhiều mốc thời gian. Hãy xác định từng ngày gắn với sự kiện nào rồi tìm ngày được “suggest”.',
    explanation: 'Đáp án đúng là (D) On 20 March. Bài viết: “he suggests holding the meeting on 20 March at 10:00 A.M. in our head office.” (A) 8 March là ngày gửi bản đề xuất. (B) 15 March là hạn xác nhận tham dự. (C) 18 March là ngày ông Howard đi công tác về.',
    note: 'Câu hỏi về ngày tháng thường có nhiều mốc gây nhiễu; cần gắn mỗi ngày với đúng sự kiện trước khi chọn.',
  },
  'Who will also attend the meeting?': {
    translation: { stem: 'Ai cũng sẽ tham dự cuộc họp?', options: { A: 'Một cố vấn pháp lý', B: 'Một cố vấn tài chính', C: 'Một quản lý giao hàng', D: 'Trợ lý của bà Joseph' } },
    hint: 'Tìm câu có từ “attend” và xác định chức danh của người được nhắc đến.',
    explanation: 'Đáp án đúng là (B) A finance advisor. Bài viết: “our finance advisor, Ms. Lee, will also attend.” (A) sai vì bộ phận pháp lý chỉ chuẩn bị giấy tờ, không được nói là tham dự. (C) sai vì “delivery” chỉ xuất hiện trong “delivery schedule”. (D) sai vì thư không nhắc đến trợ lý của bà Joseph.',
    note: 'Phương án (A) dùng từ “legal” có trong bài nhưng gắn với việc chuẩn bị giấy tờ, không phải người tham dự.',
  },
  "What is Ms. Joseph asked to bring?": {
    translation: { stem: 'Bà Joseph được đề nghị mang theo gì?', options: { A: 'Một hợp đồng đã ký', B: 'Danh sách các ngày thay thế', C: 'Bảng ước tính chi phí và lịch giao hàng', D: 'Giấy tờ từ bộ phận pháp lý' } },
    hint: 'Tìm câu có động từ “bring” và đọc kỹ tân ngữ đi sau.',
    explanation: 'Đáp án đúng là (C) Cost estimates and a delivery schedule. Bài viết: “We would appreciate it if you could bring the cost estimates and the delivery schedule mentioned in your proposal.” (A) sai vì thư không nhắc đến hợp đồng. (B) sai vì danh sách ngày khác chỉ cần gửi nếu ngày 20/3 không phù hợp, không phải mang đến. (D) sai vì giấy tờ do bộ phận pháp lý của HF Manufacturers chuẩn bị.',
    note: 'Phân biệt việc “let us know” (thông báo) với “bring” (mang theo) để tránh chọn (B).',
  },
};

const norm = text => String(text || '').replace(/\s+/g, ' ').trim();
const translationFor = sentence => TRANSLATIONS[norm(sentence)] || null;
const isSamplePassage = sentences => sentences.length > 0 && sentences.every(sentence => translationFor(sentence));
const questionPackFor = stem => QUESTIONS[norm(stem)] || null;

module.exports = { translationFor, isSamplePassage, questionPackFor, VOCAB, DICTIONARY };
