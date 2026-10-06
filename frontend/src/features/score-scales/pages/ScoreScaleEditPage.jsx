import React from 'react';
import { useParams } from 'react-router-dom';
import ScoreScaleCreatePage from './ScoreScaleCreatePage';

export default function ScoreScaleEditPage(props) {
  const { id } = useParams();
  return <ScoreScaleCreatePage {...props} scoreScaleId={id} />;
}
